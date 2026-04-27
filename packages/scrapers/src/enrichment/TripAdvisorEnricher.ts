/**
 * TripAdvisor enricher — extracts hotel ratings and review snippets.
 *
 * Strategy (in order of reliability):
 *   1. JSON-LD structured data in <head> — stable across TA redesigns
 *   2. page.evaluate() reading TA DOM state
 *   3. Flexible aria-label / data-automation selectors as final fallback
 *
 * NOTE: TripAdvisor blocks automated traffic. This implementation uses
 * realistic browser fingerprinting and respects rate limits.
 * It only collects publicly visible aggregate data, no auth bypass.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export class TripAdvisorEnricher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter({
      requestsPerWindow: 10,
      windowMs: 60_000,
      minDelayMs: parseInt(process.env['ENRICHMENT_DELAY_MS'] ?? '2000', 10),
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
      extraHTTPHeaders: {
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

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

    // Strategy 1: TypeAhead JSON API — plain fetch, bypasses TA search page bot detection
    let hotelUrl = await this.findHotelUrlViaTypeAhead(hotelName, location);

    // Strategy 2: Fall back to loading the search page in a real browser
    if (!hotelUrl) {
      const searchPage = await this.context.newPage();
      try {
        const q = encodeURIComponent(`${hotelName} ${location} hotel`);
        await searchPage.goto(`https://www.tripadvisor.com/Search?q=${q}&lang=pl`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await jitteredDelay(2500, 1000);
        await this.dismissCookies(searchPage);
        hotelUrl = await this.findHotelUrlFromPage(searchPage);
      } finally {
        await searchPage.close();
      }
    }

    if (!hotelUrl) {
      logger.warn(`No TripAdvisor result for "${hotelName}"`);
      return null;
    }

    const fullUrl = hotelUrl.startsWith('http')
      ? hotelUrl
      : `https://www.tripadvisor.com${hotelUrl}`;
    const plUrl = fullUrl.includes('?') ? `${fullUrl}&lang=pl` : `${fullUrl}?lang=pl`;

    const page = await this.context.newPage();
    try {
      await this.rateLimiter.acquire();
      await page.goto(plUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await jitteredDelay(2500, 1000);
      await this.dismissCookies(page);

      const ratingData = await this.extractRatingData(page, plUrl);
      if (!ratingData) return null;

      const photos = await this.extractPhotos(page);
      return { data: ratingData, photos };
    } finally {
      await page.close();
    }
  }

  private async findHotelUrlViaTypeAhead(hotelName: string, location: string): Promise<string | null> {
    for (const query of [`${hotelName} ${location}`, hotelName]) {
      try {
        const res = await fetch(
          `https://www.tripadvisor.com/TypeAheadJson?query=${encodeURIComponent(query)}&lang=pl&typeaheadv2=true&searchNearby=false&expand=Hotels`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
              Referer: 'https://www.tripadvisor.com/',
            },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (!res.ok) continue;
        const data = await res.json() as { results?: Array<{ url?: string; detailType?: string }> };
        const match = (data.results ?? []).find(
          (r) => r.url?.includes('/Hotel_Review') || r.detailType === 'HOTEL',
        );
        if (match?.url) {
          logger.debug(`TypeAhead found hotel URL for "${hotelName}": ${match.url}`);
          return match.url;
        }
      } catch (err) {
        logger.debug(`TypeAhead lookup failed for "${query}": ${String(err)}`);
      }
    }
    return null;
  }

  private async dismissCookies(page: Page): Promise<void> {
    const selectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]',
      'button:has-text("Accept all")',
      'button:has-text("Akceptuj")',
      'button:has-text("OK")',
    ];
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click();
          await jitteredDelay(600, 300);
          return;
        }
      } catch { /* continue */ }
    }
  }

  private async findHotelUrlFromPage(page: Page): Promise<string | null> {
    const selectors = [
      'a[href*="/Hotel_Review"]',
      '[data-automation="SearchResultCard"] a[href*="Hotel"]',
      '[data-searchlisting] a[href*="Hotel"]',
    ];

    for (const sel of selectors) {
      try {
        const href = await page.locator(sel).first().getAttribute('href', { timeout: 3000 });
        if (href) return href;
      } catch { /* try next */ }
    }

    return page.evaluate((): string | null => {
      const link = document.querySelector<HTMLAnchorElement>('a[href*="/Hotel_Review"]');
      return link?.href ?? null;
    });
  }

  private async extractRatingData(
    page: Page,
    url: string,
  ): Promise<Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'> | null> {
    try {
      // Strategy 1: JSON-LD (most stable — doesn't break with CSS redesigns)
      const jsonLd = await page.evaluate((): AnyObj | null => {
        for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
          try {
            const d = JSON.parse(el.textContent ?? '');
            if (d.aggregateRating || d['@type'] === 'Hotel' || d['@type'] === 'LodgingBusiness') {
              return d;
            }
          } catch { /* skip */ }
        }
        return null;
      });

      let overallRating: number | null = null;
      let reviewCount: number | null = null;

      if (jsonLd?.aggregateRating) {
        overallRating = parseFloat(String(jsonLd.aggregateRating.ratingValue)) || null;
        reviewCount = parseInt(String(jsonLd.aggregateRating.reviewCount), 10) || null;
        logger.debug(`JSON-LD: rating=${overallRating}, reviews=${reviewCount} for ${url}`);
      }

      // Strategy 2: DOM evaluation for rating number and review count
      if (!overallRating) {
        const domData = await page.evaluate((): { rating: number | null; count: number | null } => {
          const ratingEl = document.querySelector<HTMLElement>(
            '[data-automation="ratingNumber"], [class*="biGQs"][class*="P"]',
          );
          const ratingText = ratingEl?.textContent?.replace(',', '.').trim() ?? '';
          const rating = parseFloat(ratingText) || null;

          let count: number | null = null;
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-automation="reviewCount"]'))) {
            const n = parseInt((el.textContent ?? '').replace(/[^\d]/g, ''), 10);
            if (n > 10) { count = n; break; }
          }

          return { rating: rating && rating <= 5 ? rating : null, count };
        });

        overallRating = domData.rating;
        reviewCount = domData.count;
      }

      // Strategy 3: Category scores via aria-labels ("Wyżywienie 4,5 z 5")
      const categoryScores = await page.evaluate((): AnyObj => {
        const scores: AnyObj = {};
        const labelMap: Record<string, string> = {
          'wyżywieni': 'food', 'jedzeni': 'food', 'food': 'food', 'cuisine': 'food',
          'pokój': 'rooms', 'pokoje': 'rooms', 'rooms': 'rooms', 'room': 'rooms',
          'czystość': 'cleanliness', 'cleanliness': 'cleanliness',
          'obsługa': 'service', 'service': 'service', 'staff': 'service',
          'plaż': 'beach', 'beach': 'beach',
        };

        Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).forEach((el) => {
          const label = (el.getAttribute('aria-label') ?? '').toLowerCase();
          const m = /([a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ\s]+)\s+([\d,\.]+)\s*(z|of|\/)\s*5/i.exec(label);
          if (!m) return;
          const category = m[1].trim().toLowerCase();
          const score = parseFloat(m[2].replace(',', '.'));
          if (!score || score > 5) return;

          for (const [key, mapped] of Object.entries(labelMap)) {
            if (category.includes(key) && !scores[mapped]) {
              scores[mapped] = score;
            }
          }
        });

        return scores;
      });

      const reviewSnippets = await this.extractReviewSnippets(page);

      const sentimentTags = this.buildSentimentTags({
        overallRating,
        foodScore: categoryScores['food'] ?? null,
        roomsScore: categoryScores['rooms'] ?? null,
        cleanlinessScore: categoryScores['cleanliness'] ?? null,
        serviceScore: categoryScores['service'] ?? null,
      });

      if (!overallRating && reviewSnippets.length === 0) {
        logger.warn(`Could not extract any data from TripAdvisor for ${url}`);
        return null;
      }

      return {
        source: 'tripadvisor',
        overallRating,
        reviewCount,
        foodScore: categoryScores['food'] ?? null,
        foodSummary: this.buildScoreSummary('jedzenie', categoryScores['food'] ?? null),
        roomsScore: categoryScores['rooms'] ?? null,
        roomsSummary: this.buildScoreSummary('pokoje', categoryScores['rooms'] ?? null),
        cleanlinessScore: categoryScores['cleanliness'] ?? null,
        serviceScore: categoryScores['service'] ?? null,
        beachScore: categoryScores['beach'] ?? null,
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
    return page.evaluate((): Array<{ text: string; rating: number | null }> => {
      const results: Array<{ text: string; rating: number | null }> = [];

      const cardSelectors = [
        '[data-automation="reviewCard"]',
        '[class*="ReviewCard"]',
        '[class*="review-container"]',
        '[class*="listItem"]',
      ];

      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        cards = Array.from(document.querySelectorAll(sel)).slice(0, 6);
        if (cards.length > 0) break;
      }

      for (const card of cards) {
        const textEl =
          card.querySelector('[data-automation="reviewText"]') ??
          card.querySelector('[class*="reviewText"]') ??
          card.querySelector('[class*="partial_entry"]') ??
          Array.from(card.querySelectorAll('p, span')).find(
            (el) => (el.textContent?.length ?? 0) > 80,
          );

        const text = textEl?.textContent?.trim().slice(0, 500) ?? '';
        if (text.length < 30) continue;

        let rating: number | null = null;
        const ratingEl = card.querySelector<HTMLElement>(
          '[aria-label*="z 5"], [aria-label*="of 5"], [class*="ui_bubble_rating"]',
        );
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute('aria-label') ?? '';
          const m = /([\d,\.]+)\s*(z|of)\s*5/i.exec(ariaLabel);
          if (m) {
            rating = parseFloat(m[1].replace(',', '.'));
          } else {
            const bm = /bubble_(\d+)/.exec(ratingEl.className ?? '');
            if (bm) rating = parseInt(bm[1], 10) / 10;
          }
        }

        results.push({ text, rating });
      }

      return results;
    });
  }

  private async extractPhotos(page: Page): Promise<string[]> {
    const urls: string[] = [];

    try {
      const og = await page.getAttribute('meta[property="og:image"]', 'content').catch(() => null);
      if (og?.startsWith('http')) urls.push(og);
    } catch { /* ignore */ }

    try {
      const more = await page.evaluate((): string[] =>
        Array.from(document.querySelectorAll('img'))
          .flatMap((img) => [
            img.src,
            img.getAttribute('data-src') ?? '',
            img.getAttribute('data-lazyurl') ?? '',
          ])
          .filter((u) =>
            u && (
              u.includes('tripadvisor.com/media/photo') ||
              u.includes('dynamic-media-cdn.tripadvisor.com')
            ),
          ),
      );
      for (const u of more) {
        if (!urls.includes(u)) urls.push(u);
      }
    } catch { /* ignore */ }

    return urls.slice(0, 8);
  }

  private buildSentimentTags(scores: {
    overallRating: number | null;
    foodScore: number | null;
    roomsScore: number | null;
    cleanlinessScore: number | null;
    serviceScore: number | null;
  }): string[] {
    const tags: string[] = [];

    if (scores.foodScore !== null) {
      if (scores.foodScore >= 4.5) tags.push('jedzenie: wyśmienite');
      else if (scores.foodScore >= 4.0) tags.push('jedzenie: bardzo dobre');
      else if (scores.foodScore >= 3.5) tags.push('jedzenie: dobre');
      else tags.push('jedzenie: słabe');
    }

    if (scores.roomsScore !== null) {
      if (scores.roomsScore >= 4.5) tags.push('pokoje: świetne');
      else if (scores.roomsScore >= 4.0) tags.push('pokoje: dobre');
      else tags.push('pokoje: przeciętne');
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

    return tags;
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
