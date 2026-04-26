/**
 * Booking.com review enricher — fetches Polish guest reviews.
 *
 * Why Booking.com: largest Polish-language review dataset;
 * ?lang=pl restricts results to Polish reviewers. Each review has
 * structured "pros" and "cons" sections ideal for rooms/food filtering.
 *
 * Score normalisation: Booking 10-point scale stored as 5-point
 * to match TripAdvisor values in hotel_reviews_summary.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'patchright';
import type { HotelReviewSummary } from '@wakacje/shared';
import { logger } from '../base/logger.js';
import { jitteredDelay, withRetry } from '../base/retry.js';
import { RateLimiter } from '../base/RateLimiter.js';

export interface BookingEnrichmentResult {
  hotelId: string;
  hotelName: string;
  booking?: Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const to5 = (v: number | null): number | null =>
  v !== null && v > 0 ? Math.round((v / 2) * 10) / 10 : null;

export class BookingReviewEnricher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter({
      requestsPerWindow: 8,
      windowMs: 60_000,
      minDelayMs: parseInt(process.env['ENRICHMENT_DELAY_MS'] ?? '2500', 10),
    });
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env['SCRAPER_HEADLESS'] !== 'false',
    });
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw',
      extraHTTPHeaders: { 'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7' },
    });
    await this.context.route('**/*.{png,jpg,jpeg,gif,webp,ico,svg,woff,woff2}', (r) => r.abort());
    await this.context.route('**/{ads,analytics,sentry,tracking}**', (r) => r.abort());
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
  }

  async enrichHotel(hotelId: string, hotelName: string, location: string): Promise<BookingEnrichmentResult> {
    const result: BookingEnrichmentResult = { hotelId, hotelName };
    try {
      await this.rateLimiter.acquire();
      const data = await withRetry(
        async () => this.fetchBookingData(hotelName, location),
        { maxRetries: 2, baseDelayMs: 5000 },
      );
      if (data) result.booking = data;
    } catch (err) {
      logger.warn(`Booking enrichment failed for "${hotelName}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return result;
  }

  private async fetchBookingData(
    hotelName: string,
    location: string,
  ): Promise<Omit<HotelReviewSummary, 'id' | 'hotelId' | 'createdAt'> | null> {
    if (!this.context) throw new Error('Enricher not initialized');
    const page = await this.context.newPage();
    try {
      const q = encodeURIComponent(`${hotelName} ${location}`);
      await page.goto(
        `https://www.booking.com/searchresults.pl.html?ss=${q}&lang=pl&nflt=ht_id%3D204`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      await jitteredDelay(2000, 800);
      await this.dismissCookies(page);

      const hotelUrl = await this.findHotelUrl(page, hotelName);
      if (!hotelUrl) { logger.warn(`No Booking.com result for "${hotelName}"`); return null; }

      const plUrl = hotelUrl.includes('?') ? `${hotelUrl}&lang=pl` : `${hotelUrl}?lang=pl`;
      await this.rateLimiter.acquire();
      await page.goto(plUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await jitteredDelay(2000, 800);
      await this.dismissCookies(page);

      const scores = await this.extractScores(page);
      const reviewSnippets = await this.extractPolishReviews(page);

      if (!scores.overall && reviewSnippets.length === 0) {
        logger.warn(`No usable Booking.com data for "${hotelName}"`);
        return null;
      }

      return {
        source: 'booking',
        overallRating: to5(scores.overall),
        reviewCount: scores.reviewCount,
        foodScore: to5(scores.meals),
        foodSummary: this.buildSummary('jedzenie', to5(scores.meals)),
        roomsScore: to5(scores.comfort),
        roomsSummary: this.buildSummary('pokoje', to5(scores.comfort)),
        cleanlinessScore: to5(scores.cleanliness),
        serviceScore: to5(scores.staff),
        beachScore: null,
        sentimentTags: this.buildSentimentTags(scores),
        reviewSnippets,
        scrapedAt: new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }

  private async dismissCookies(page: Page): Promise<void> {
    for (const sel of ['#onetrust-accept-btn-handler', 'button[data-gdpr-consent="all"]', 'button:has-text("Zaakceptuj")', 'button:has-text("Accept")']) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 })) { await btn.click(); await jitteredDelay(500, 200); return; }
      } catch { /* continue */ }
    }
  }

  private async findHotelUrl(page: Page, hotelName: string): Promise<string | null> {
    return page.evaluate((name: string): string | null => {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(name.slice(0, 20));
      const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-testid="property-card"] a[href*="/hotel/"], a[href*="booking.com/hotel/"]'));
      for (const card of cards) {
        const title = card.querySelector('[data-testid="title"]')?.textContent ?? card.textContent ?? '';
        if (norm(title).includes(target.slice(0, 10))) return card.href;
      }
      return document.querySelector<HTMLAnchorElement>('[data-testid="property-card"] a[href*="/hotel/"]')?.href ?? null;
    }, hotelName);
  }

  private async extractScores(page: Page): Promise<{ overall: number | null; reviewCount: number | null; cleanliness: number | null; comfort: number | null; staff: number | null; facilities: number | null; meals: number | null; valueForMoney: number | null }> {
    const jsonLd = await page.evaluate((): AnyObj | null => {
      for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try { const d = JSON.parse(el.textContent ?? ''); if (d.aggregateRating) return d; } catch { /* skip */ }
      }
      return null;
    });

    let overall: number | null = null;
    let reviewCount: number | null = null;
    if (jsonLd?.aggregateRating) {
      const rv = parseFloat(String(jsonLd.aggregateRating.ratingValue));
      overall = rv > 5 ? rv : rv * 2;
      overall = isNaN(overall) ? null : overall;
      reviewCount = parseInt(String(jsonLd.aggregateRating.reviewCount), 10) || null;
    }

    const subscores = await page.evaluate((): AnyObj => {
      const result: AnyObj = {};
      const labelMap: Record<string, string> = {
        'czystość': 'cleanliness', 'komfort': 'comfort', 'obsługa': 'staff',
        'udogodnienia': 'facilities', 'jakość wyżywienia': 'meals',
        'jakość śniadań': 'meals', 'wyżywienie': 'meals', 'stosunek ceny': 'valueForMoney',
      };
      Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).forEach((el) => {
        const label = (el.getAttribute('aria-label') ?? '').toLowerCase();
        const m = /^([a-zA-Z\s]+):\s*([\d,.]+)/i.exec(label);
        if (!m) return;
        const key = m[1].trim().toLowerCase();
        const score = parseFloat(m[2].replace(',', '.'));
        if (!score || score > 10) return;
        for (const [mapKey, mapped] of Object.entries(labelMap)) {
          if (key.includes(mapKey) && !result[mapped]) result[mapped] = score;
        }
      });
      return result;
    });

    return {
      overall, reviewCount,
      cleanliness: (subscores['cleanliness'] as number | undefined) ?? null,
      comfort: (subscores['comfort'] as number | undefined) ?? null,
      staff: (subscores['staff'] as number | undefined) ?? null,
      facilities: (subscores['facilities'] as number | undefined) ?? null,
      meals: (subscores['meals'] as number | undefined) ?? null,
      valueForMoney: (subscores['valueForMoney'] as number | undefined) ?? null,
    };
  }

  private async extractPolishReviews(page: Page): Promise<Array<{ text: string; rating: number | null }>> {
    return page.evaluate((): Array<{ text: string; rating: number | null }> => {
      const results: Array<{ text: string; rating: number | null }> = [];
      const cards = Array.from(document.querySelectorAll('[data-testid="review-card"], [class*="c-review"], [id*="review_"]')).slice(0, 8);
      for (const card of cards) {
        const prosEl = card.querySelector('[data-testid="review-positive-text"], [class*="c-review__pros"]');
        const consEl = card.querySelector('[data-testid="review-negative-text"], [class*="c-review__cons"]');
        const pros = prosEl?.textContent?.trim().slice(0, 300) ?? '';
        const cons = consEl?.textContent?.trim().slice(0, 300) ?? '';
        let text = '';
        if (pros.length > 10) text += `Podoba mi sie: ${pros}`;
        if (cons.length > 10) text += (text ? '\n' : '') + `Nie podoba mi sie: ${cons}`;
        if (text.length < 20) { const fb = card.textContent?.trim().slice(0, 500) ?? ''; if (fb.length > 40) text = fb; }
        if (text.length < 20) continue;
        let rating: number | null = null;
        const scoreEl = card.querySelector<HTMLElement>('[data-testid="review-score"], [class*="bui-review-score__badge"]');
        if (scoreEl) { const n = parseFloat((scoreEl.textContent ?? '').replace(',', '.')); if (n > 0 && n <= 10) rating = n; }
        results.push({ text, rating });
      }
      return results;
    });
  }

  private buildSentimentTags(scores: { overall: number | null; meals: number | null; comfort: number | null; cleanliness: number | null; staff: number | null }): string[] {
    const tags: string[] = [];
    const lbl = (aspect: string, v: number | null): string | null => {
      if (v === null) return null;
      const p = v / 10;
      if (p >= 0.9) return `${aspect}: wysmienite`; if (p >= 0.8) return `${aspect}: bardzo dobre`;
      if (p >= 0.7) return `${aspect}: dobre`; if (p < 0.6) return `${aspect}: przecietne`; return null;
    };
    [lbl('jedzenie', scores.meals), lbl('pokoje', scores.comfort), lbl('czystosc', scores.cleanliness), lbl('obsluga', scores.staff)].forEach((t) => t && tags.push(t));
    if (scores.overall !== null) {
      const p = scores.overall / 10;
      tags.push(p >= 0.9 ? 'ogolnie: wybitny' : p >= 0.8 ? 'ogolnie: bardzo dobry' : p >= 0.7 ? 'ogolnie: dobry' : 'ogolnie: mieszane opinie');
    }
    return tags;
  }

  private buildSummary(aspect: string, score: number | null): string | null {
    if (score === null) return null;
    if (score >= 4.5) return `Wybitne ${aspect}`;
    if (score >= 4.0) return `Bardzo dobre ${aspect}`;
    if (score >= 3.5) return `Dobre ${aspect}`;
    if (score >= 3.0) return `Przecietne ${aspect}`;
    return `Slabe ${aspect}`;
  }
}
