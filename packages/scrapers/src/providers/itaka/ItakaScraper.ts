import type { Page, Route } from 'patchright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { parseItakaPage, parseItakaApiResponse } from './parser.js';
import { ITAKA_SELECTORS, ITAKA_CONFIG, ITAKA_DESTINATIONS, ITAKA_BOARD_MAP, ITAKA_STARS_MAP } from './config.js';

export class ItakaScraper extends BaseScraper {
  readonly providerCode = 'itaka' as const;
  readonly baseUrl = 'https://www.itaka.pl';
  readonly selectors = ITAKA_SELECTORS;

  private interceptedOffers: RawOffer[] = [];

  /**
   * Build Itaka search URLs.
   *
   * Itaka's real search URL is:
   *   /wyniki-wyszukiwania/wakacje/:destination/?dateFrom=D.MM.YYYY&...
   *
   * Confirmed from their Next.js route definitions found in page HTML.
   */
  protected buildSearchUrls(filter: SearchFilter): string[] {
    const urls: string[] = [];

    const formatDate = (iso: string): string => {
      const [year, month, day] = iso.split('-');
      return `${parseInt(day!, 10)}.${month}.${year}`;
    };

    const baseUrl = ITAKA_CONFIG.searchUrl;

    const itakaDests = filter.destinations
      .map((d) => ITAKA_DESTINATIONS[d])
      .filter(Boolean) as string[];

    const destinations = itakaDests.length > 0 ? itakaDests : [''];

    for (const dest of destinations) {
      // Build query string manually — URLSearchParams encodes [] to %5B%5D
      // but Itaka's Next.js router requires literal brackets for participants[0][adults]
      const enc = encodeURIComponent;
      const parts: string[] = [
        `dateFrom=${enc(formatDate(filter.departureDateFrom))}`,
        `dateTo=${enc(formatDate(filter.departureDateTo))}`,
        `departuresByPlane=${enc(filter.departureAirports.join(','))}`,
        `durationMin=${filter.nights.min}`,
        `durationMax=${filter.nights.max}`,
        `participants[0][adults]=${filter.adults}`,
      ];

      if (filter.children > 0) {
        parts.push(`participants[0][children]=${filter.children}`);
      }

      const starValues = filter.hotelStars
        .map((s) => ITAKA_STARS_MAP[s])
        .filter(Boolean) as string[];
      if (starValues.length > 0) {
        parts.push(`minHotelCategory=${starValues[0]!}`);
      }

      const boardValues = filter.boardTypes
        .map((b) => ITAKA_BOARD_MAP[b])
        .filter(Boolean) as string[];
      if (boardValues.length > 0) {
        parts.push(`boardType=${enc(boardValues.join(','))}`);
      }

      const qs = parts.join('&');
      const url = dest ? `${baseUrl}${dest}/?${qs}` : `${baseUrl}?${qs}`;
      urls.push(url);
    }

    logger.info(`Built ${urls.length} Itaka search URLs`, undefined, 'itaka');
    return urls;
  }

  async init(): Promise<void> {
    await super.init();

    if (!this.context) return;

    // Intercept Next.js _next/data responses as a supplemental capture mechanism.
    // Primary parsing is via __NEXT_DATA__ (SSR); this catches client-side navigations.
    const tryIntercept = async (route: Route) => {
      let response;
      try {
        response = await route.fetch();
      } catch {
        // SSL / network error on 3rd-party domain — skip gracefully
        await route.continue().catch(() => undefined);
        return;
      }
      try {
        const ct = response.headers()['content-type'] ?? '';
        if (ct.includes('json')) {
          const json = await response.json();
          const offers = parseItakaApiResponse(json, route.request().url());
          if (offers.length > 0) {
            logger.debug(`Intercepted ${offers.length} Itaka offers from ${route.request().url().slice(0, 120)}`, undefined, 'itaka');
            this.interceptedOffers.push(...offers);
          }
        }
      } catch {
        // not JSON or not offers
      }
      await route.fulfill({ response });
    };

    const handler = tryIntercept as Parameters<typeof this.context.route>[1];
    await this.context.route('**/_next/data/**', handler);
    await this.context.route('**/api/**', handler);
    await this.context.route('**/search**', handler);
    await this.context.route('**/oferty**', handler);
    await this.context.route('**/wyniki**', handler);
    await this.context.route('**/*.json*', handler);
    await this.context.route('**/oferta**', handler);
    await this.context.route('**/holiday**', handler);
    await this.context.route('**/wakacje**', handler);
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    if (this.interceptedOffers.length > 0) {
      const offers = [...this.interceptedOffers];
      this.interceptedOffers = [];
      logger.info(`Using ${offers.length} Itaka offers from API interception`, undefined, 'itaka');
      return offers;
    }
    return parseItakaPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    // Give the React app time to hydrate and fire API/data calls.
    // networkidle never fires on Itaka — use a fixed settle time instead.
    await jitteredDelay(5000, 2000);

    try {
      await page.waitForSelector(ITAKA_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: 10_000,
      });
    } catch { /* no spinner */ }

    try {
      await Promise.race([
        page.waitForSelector(ITAKA_SELECTORS.offerCard, { timeout: 15_000 }),
        page.waitForSelector(ITAKA_SELECTORS.noResults, { timeout: 15_000 }),
      ]);
    } catch {
      logger.warn('Timeout waiting for Itaka results', undefined, 'itaka');
    }

    await jitteredDelay(1000, 500);
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      const loadMoreBtn = page.locator(ITAKA_SELECTORS.loadMoreBtn).first();
      if (await loadMoreBtn.isVisible({ timeout: 2000 })) {
        await loadMoreBtn.scrollIntoViewIfNeeded();
        await loadMoreBtn.click();
        await jitteredDelay(2500, 1000);
        return true;
      }

      // URL-based pagination
      const currentUrl = page.url();
      const urlObj = new URL(currentUrl);
      const currentPage = parseInt(urlObj.searchParams.get('page') ?? '1', 10);
      urlObj.searchParams.set('page', (currentPage + 1).toString());
      await page.goto(urlObj.toString(), { waitUntil: 'networkidle', timeout: 30000 });
      await jitteredDelay(1500, 500);

      const newPage = parseInt(new URL(page.url()).searchParams.get('page') ?? '1', 10);
      return newPage > currentPage;
    } catch {
      return false;
    }
  }
}
