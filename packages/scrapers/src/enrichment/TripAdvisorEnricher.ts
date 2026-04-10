/**
 * TripAdvisor enricher.
 *
 * Strategy:
 * 1. Search TripAdvisor for hotel name + location
 * 2. Navigate to hotel page
 * 3. Extract rating, review count, category scores
 * 4. Generate sentiment summary tags
 *
 * NOTE: TripAdvisor actively blocks scraping. This implementation:
 * - Uses realistic browser fingerprinting
 * - Respects rate limits (≥3s between requests)
 * - Only collects publicly visible aggregate data
 * - Does NOT bypass CAPTCHA or authentication
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'patchright';
import type { HotelReviewSummary } from '@wakacje/shared';
import { logger } from '../base/logger.js';
import { jitteredDelay, withRetry } from '../base/retry.js';
import { RateLimiter } from '../base/RateLimiter.js';

export interface EnrichmentResult {
  hotelId: string;
  hotelName: string;
  tripadvisor?: Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'>;
  photos: string[];
}

const TA_SELECTORS = {
  searchInput: 'input[placeholder*="Search"], input[name="q"], #typeahead_searchbox',
  searchResult: '[class*="SearchResultCard"], [data-automation="SearchResultCard"]',
  resultTitle: 'a[href*="/Hotel_Review"], [class*="resultTitle"]',
  overallRating: '[class*="ui_bubble_rating"], [data-automation="bubbleRating"]',
  reviewCount: '[class*="reviewCount"], [class*="review_count"]',
  ratingBubble: 'span[class*="bubble_"]',
  categoryScores: '[class*="sectionTitle"] + [class*="score"], [class*="categoryRating"]',
  foodScore: 'div:has-text("Wyżywienie") .ui_bubble_rating, div:has-text("Food") .ui_bubble_rating',
  roomsScore: 'div:has-text("Pokoje") .ui_bubble_rating, div:has-text("Rooms") .ui_bubble_rating',
  cleanlinessScore: 'div:has-text("Czystość") .ui_bubble_rating, div:has-text("Cleanliness") .ui_bubble_rating',
  serviceScore: 'div:has-text("Obsługa") .ui_bubble_rating, div:has-text("Service") .ui_bubble_rating',
  locationScore: 'div:has-text("Lokalizacja") .ui_bubble_rating, div:has-text("Location") .ui_bubble_rating',
  reviewText: '[class*="review_container"] [class*="reviewText"], [data-automation="reviewText"]',
};

export class TripAdvisorEnricher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter({
      requestsPerWindow: 12,
      windowMs: 60_000,
      minDelayMs: parseInt(process.env['ENRICHMENT_DELAY_MS'] ?? '1500', 10),
    });
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env['SCRAPER_HEADLESS'] !== 'false',
    });
    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw',
    });

    // Block images and ads to speed up loading
    await this.context.route(
      '**/*.{png,jpg,jpeg,gif,webp,ico,svg,woff,woff2}',
      (route) => route.abort(),
    );
    await this.context.route('**/{ads,analytics,tracking}**', (route) => route.abort());
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  async enrichHotel(
    hotelId: string,
    hotelName: string,
    location: string,
  ): Promise<EnrichmentResult> {
    const result: EnrichmentResult = { hotelId, hotelName, photos: [] };

    try {
      await this.rateLimiter.acquire();

      const reviewData = await withRetry(
        async () => this.fetchTripAdvisorData(hotelName, location),
        { maxRetries: 2, baseDelayMs: 5000 },
      );

      if (reviewData) {
        result.tripadvisor = reviewData.data;
        result.photos = reviewData.photos;
      }
    } catch (err) {
      logger.warn(`TripAdvisor enrichment failed for "${hotelName}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  private async fetchTripAdvisorData(
    hotelName: string,
    location: string,
  ): Promise<{ data: Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'>; photos: string[] } | null> {
    if (!this.context) throw new Error('Enricher not initialized');

    const page = await this.context.newPage();

    try {
      // Step 1: Search TripAdvisor
      const searchQuery = encodeURIComponent(`${hotelName} ${location} hotel`);
      const searchUrl = `https://www.tripadvisor.com/Search?q=${searchQuery}`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await jitteredDelay(2000, 1000);

      // Accept cookies if asked
      try {
        const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("OK")').first();
        if (await acceptBtn.isVisible({ timeout: 3000 })) {
          await acceptBtn.click();
          await jitteredDelay(1000, 500);
        }
      } catch {
        // no cookie dialog
      }

      // Step 2: Find first hotel result
      const firstResult = page.locator(TA_SELECTORS.resultTitle).first();
      const hotelUrl = await firstResult.getAttribute('href', { timeout: 10000 });

      if (!hotelUrl) {
        logger.warn(`No TripAdvisor result for "${hotelName}"`, undefined);
        return null;
      }

      const fullUrl = hotelUrl.startsWith('http')
        ? hotelUrl
        : `https://www.tripadvisor.com${hotelUrl}`;

      // Step 3: Navigate to hotel page
      await this.rateLimiter.acquire();
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await jitteredDelay(2000, 1000);

      // Step 4: Extract rating data and photos
      const ratingData = await this.extractRatingData(page, fullUrl);
      if (!ratingData) return null;

      const photos = await this.extractPhotos(page);
      return { data: ratingData, photos };
    } finally {
      await page.close();
    }
  }

  private async extractRatingData(
    page: Page,
    _url: string,
  ): Promise<Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'> | null> {
    try {
      // Extract overall rating
      const ratingText = await page
        .locator('[class*="ui_bubble_rating"], [data-automation="bubbleRating"]')
        .first()
        .getAttribute('class', { timeout: 5000 });

      // TripAdvisor ratings are encoded in class names like "bubble_50" = 5.0
      const ratingMatch = ratingText ? /bubble_(\d+)/.exec(ratingText) : null;
      const overallRating = ratingMatch ? parseInt(ratingMatch[1]!, 10) / 10 : null;

      // Extract review count
      const reviewCountText = await page
        .locator('[class*="reviewCount"], [class*="review_count"], [data-automation="reviewCount"]')
        .first()
        .innerText({ timeout: 5000 })
        .catch(() => '');

      const reviewCount = reviewCountText
        ? parseInt(reviewCountText.replace(/[^\d]/g, ''), 10) || null
        : null;

      // Extract category scores
      const categoryScore = async (selector: string): Promise<number | null> => {
        try {
          const el = page.locator(selector).first();
          const cls = await el.getAttribute('class', { timeout: 3000 });
          const match = cls ? /bubble_(\d+)/.exec(cls) : null;
          return match ? parseInt(match[1]!, 10) / 10 : null;
        } catch {
          return null;
        }
      };

      const foodScore = await categoryScore(TA_SELECTORS.foodScore);
      const roomsScore = await categoryScore(TA_SELECTORS.roomsScore);
      const cleanlinessScore = await categoryScore(TA_SELECTORS.cleanlinessScore);
      const serviceScore = await categoryScore(TA_SELECTORS.serviceScore);

      // Generate sentiment tags from visible review snippets
      const sentimentTags = await this.extractSentimentTags(page, {
        foodScore,
        roomsScore,
        cleanlinessScore,
        serviceScore,
        overallRating,
      });

      // Extract up to 5 review snippets (actual review text)
      const reviewSnippets = await this.extractReviewSnippets(page);

      return {
        source: 'tripadvisor',
        overallRating,
        reviewCount,
        foodScore,
        foodSummary: this.buildScoreSummary('jedzenie', foodScore),
        roomsScore,
        roomsSummary: this.buildScoreSummary('pokoje', roomsScore),
        cleanlinessScore,
        serviceScore,
        beachScore: null,
        sentimentTags,
        reviewSnippets,
        scrapedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn('Failed to extract TripAdvisor rating data', { error: String(err) });
      return null;
    }
  }

  private async extractReviewSnippets(
    page: Page,
  ): Promise<Array<{ text: string; rating: number | null }>> {
    const snippets: Array<{ text: string; rating: number | null }> = [];
    try {
      // TripAdvisor review card selectors — try multiple patterns
      const reviewCardSel = [
        '[data-automation="reviewCard"]',
        '[class*="review_container"]',
        '[class*="ReviewCard"]',
      ].join(', ');

      const cards = page.locator(reviewCardSel);
      const count = Math.min(await cards.count(), 5);

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);

        // Extract review text
        const textEl = card
          .locator('[data-automation="reviewText"], [class*="reviewText"], [class*="review-text"]')
          .first();
        let text = '';
        try {
          text = (await textEl.innerText({ timeout: 2000 })).trim();
        } catch {
          // fallback: whole card text, first 300 chars
          try {
            text = (await card.innerText({ timeout: 2000 })).trim().slice(0, 300);
          } catch { /* skip */ }
        }

        if (!text || text.length < 20) continue;

        // Try to get per-review bubble rating (class "bubble_NN" → N.N)
        let rating: number | null = null;
        try {
          const bubbleCls = await card
            .locator('[class*="ui_bubble_rating"], [class*="bubble_rating"]')
            .first()
            .getAttribute('class', { timeout: 1500 });
          const m = bubbleCls ? /bubble_(\d+)/.exec(bubbleCls) : null;
          if (m) rating = parseInt(m[1]!, 10) / 10;
        } catch { /* no per-review rating */ }

        snippets.push({ text: text.slice(0, 400), rating });
      }
    } catch {
      // extraction failed — return whatever we have
    }
    return snippets;
  }

  private async extractSentimentTags(
    page: Page,
    scores: {
      foodScore: number | null;
      roomsScore: number | null;
      cleanlinessScore: number | null;
      serviceScore: number | null;
      overallRating: number | null;
    },
  ): Promise<string[]> {
    const tags: string[] = [];

    // Score-based tags
    if (scores.foodScore !== null) {
      if (scores.foodScore >= 4.5) tags.push('jedzenie: wyśmienite');
      else if (scores.foodScore >= 4.0) tags.push('jedzenie: bardzo dobre');
      else if (scores.foodScore >= 3.5) tags.push('jedzenie: dobre');
      else if (scores.foodScore < 3.0) tags.push('jedzenie: słabe');
    }

    if (scores.roomsScore !== null) {
      if (scores.roomsScore >= 4.5) tags.push('pokoje: świetne');
      else if (scores.roomsScore >= 4.0) tags.push('pokoje: dobre');
      else if (scores.roomsScore < 3.5) tags.push('pokoje: przeciętne');
    }

    if (scores.cleanlinessScore !== null) {
      if (scores.cleanlinessScore >= 4.5) tags.push('czystość: wzorowa');
      else if (scores.cleanlinessScore < 3.5) tags.push('czystość: do poprawy');
    }

    if (scores.serviceScore !== null) {
      if (scores.serviceScore >= 4.5) tags.push('obsługa: wyśmienita');
      else if (scores.serviceScore < 3.5) tags.push('obsługa: przeciętna');
    }

    if (scores.overallRating !== null) {
      if (scores.overallRating >= 4.5) tags.push('ogólnie: wybitny');
      else if (scores.overallRating >= 4.0) tags.push('ogólnie: bardzo dobry');
      else if (scores.overallRating >= 3.0) tags.push('ogólnie: dobry');
      else tags.push('ogólnie: mieszane opinie');
    }

    // Try to extract specific mentions from review snippets
    try {
      const reviewTexts = await page
        .locator(TA_SELECTORS.reviewText)
        .allInnerTexts();

      const combined = reviewTexts.slice(0, 10).join(' ').toLowerCase();

      const keywords = [
        { test: /plaż|beach/, tag: 'plaża wspomniana' },
        { test: /animacj|animation|entertainment/, tag: 'animacje wspomniane' },
        { test: /basen|pool/, tag: 'basen wspomniony' },
        { test: /renovated|odnowion|nowy|new room/, tag: 'niedawno odnowiony' },
        { test: /old|stary|outdated|przestarzał/, tag: 'wymaga remontu' },
        { test: /family|rodzin|dzieci|children/, tag: 'przyjazny rodzinom' },
        { test: /quiet|spokojn|cisz/, tag: 'spokojny' },
        { test: /party|głośn|noise|loud/, tag: 'głośny' },
      ];

      for (const { test, tag } of keywords) {
        if (test.test(combined)) tags.push(tag);
      }
    } catch {
      // review text extraction failed — that's OK, we have score tags
    }

    return tags;
  }

  private async extractPhotos(page: Page): Promise<string[]> {
    const urls: string[] = [];

    try {
      // og:image is most reliable — always in <head>
      const ogImage = await page
        .getAttribute('meta[property="og:image"]', 'content')
        .catch(() => null);
      if (ogImage && ogImage.startsWith('http')) urls.push(ogImage);
    } catch { /* ignore */ }

    try {
      // Extract photo CDN URLs from img tags (src attribute is present even when image load is blocked)
      const imgUrls = await page.evaluate((): string[] => {
        const results: string[] = [];
        document.querySelectorAll('img').forEach((img) => {
          const candidates = [
            img.src,
            img.getAttribute('data-src'),
            img.getAttribute('data-lazyurl'),
            img.getAttribute('data-original'),
          ].filter(Boolean) as string[];

          for (const u of candidates) {
            if (
              u &&
              (u.includes('tripadvisor.com/media/photo') ||
                u.includes('dynamic-media-cdn.tripadvisor.com'))
            ) {
              results.push(u);
            }
          }
        });
        return results;
      });

      for (const u of imgUrls) {
        if (!urls.includes(u)) urls.push(u);
      }
    } catch { /* ignore */ }

    return urls.slice(0, 8);
  }

  private buildScoreSummary(aspect: string, score: number | null): string | null {
    if (score === null) return null;

    if (score >= 4.5) return `Wybitne ${aspect}`;
    if (score >= 4.0) return `Bardzo dobre ${aspect}`;
    if (score >= 3.5) return `Dobre ${aspect}`;
    if (score >= 3.0) return `Przeciętne ${aspect}`;
    return `Słabe ${aspect} — warto sprawdzić opinie`;
  }
}
