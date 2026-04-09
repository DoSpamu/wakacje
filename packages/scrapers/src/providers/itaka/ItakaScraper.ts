import type { Page } from 'playwright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { parseItakaPage } from './parser.js';
import { ITAKA_SELECTORS, ITAKA_CONFIG, ITAKA_DESTINATIONS, ITAKA_BOARD_MAP, ITAKA_STARS_MAP } from './config.js';

export class ItakaScraper extends BaseScraper {
  readonly providerCode = 'itaka' as const;
  readonly baseUrl = 'https://www.itaka.pl';
  readonly selectors = ITAKA_SELECTORS;

  /**
   * Build Itaka search URLs from canonical filter.
   *
   * Reference URL:
   * https://www.itaka.pl/all-inclusive/tanie/?dateFrom=9.04.2026&dateTo=31.05.2026
   *   &departuresByPlane=KTW%2CKRK&page=1&durationMin=7&participants[0][adults]=2
   */
  protected buildSearchUrls(filter: SearchFilter): string[] {
    const urls: string[] = [];

    // Format date as D.MM.YYYY (Itaka format)
    const formatDate = (iso: string): string => {
      const [year, month, day] = iso.split('-');
      return `${parseInt(day!, 10)}.${month}.${year}`;
    };

    // If all-inclusive is in board types, use the dedicated /all-inclusive/ section
    const isAllInclusive = filter.boardTypes.some((b) =>
      b === 'all-inclusive' || b === 'ultra-all-inclusive',
    );

    const baseUrl = isAllInclusive
      ? `${ITAKA_CONFIG.allInclusiveUrl}`
      : `${ITAKA_CONFIG.baseSearchUrl}/`;

    // Map destinations to Itaka slugs
    const itakaDests = filter.destinations
      .map((d) => ITAKA_DESTINATIONS[d])
      .filter(Boolean) as string[];

    for (const dest of itakaDests.length > 0 ? itakaDests : ['']) {
      const params = new URLSearchParams();

      params.set('dateFrom', formatDate(filter.departureDateFrom));
      params.set('dateTo', formatDate(filter.departureDateTo));
      params.set('departuresByPlane', filter.departureAirports.join(','));
      params.set('durationMin', filter.nights.min.toString());
      params.set('durationMax', filter.nights.max.toString());
      params.set('participants[0][adults]', filter.adults.toString());

      if (filter.children > 0) {
        params.set('participants[0][children]', filter.children.toString());
      }

      // Hotel stars
      const starValues = filter.hotelStars
        .map((s) => ITAKA_STARS_MAP[s])
        .filter(Boolean) as string[];
      if (starValues.length > 0) {
        params.set('minHotelCategory', starValues[0]!);
      }

      // Board types (when not using all-inclusive URL section)
      if (!isAllInclusive) {
        const boardValues = filter.boardTypes
          .map((b) => ITAKA_BOARD_MAP[b])
          .filter(Boolean) as string[];
        if (boardValues.length > 0) {
          params.set('boardType', boardValues.join(','));
        }
      }

      if (dest) params.set('country', dest);

      const url = dest
        ? `${ITAKA_CONFIG.baseSearchUrl}/${dest}/?${params.toString()}`
        : `${baseUrl}?${params.toString()}`;

      urls.push(url);
    }

    // If no destination-specific URLs, use general search
    if (urls.length === 0) {
      const params = new URLSearchParams();
      params.set('dateFrom', formatDate(filter.departureDateFrom));
      params.set('dateTo', formatDate(filter.departureDateTo));
      params.set('departuresByPlane', filter.departureAirports.join(','));
      params.set('durationMin', filter.nights.min.toString());
      params.set('participants[0][adults]', filter.adults.toString());
      urls.push(`${baseUrl}?${params.toString()}`);
    }

    logger.info(`Built ${urls.length} Itaka search URLs`, undefined, 'itaka');
    return urls;
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    return parseItakaPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    try {
      await page.waitForSelector(ITAKA_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: ITAKA_CONFIG.resultsTimeout,
      });
    } catch {
      // no spinner
    }

    try {
      await Promise.race([
        page.waitForSelector(ITAKA_SELECTORS.offerCard, { timeout: ITAKA_CONFIG.resultsTimeout }),
        page.waitForSelector(ITAKA_SELECTORS.noResults, { timeout: ITAKA_CONFIG.resultsTimeout }),
      ]);
    } catch {
      logger.warn('Timeout waiting for Itaka results', undefined, 'itaka');
    }

    await jitteredDelay(1000, 500);
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      // Itaka has explicit pagination
      const currentUrl = page.url();
      const urlObj = new URL(currentUrl);
      const currentPage = parseInt(urlObj.searchParams.get('page') ?? '1', 10);

      const loadMoreBtn = page.locator(ITAKA_SELECTORS.loadMoreBtn).first();
      if (await loadMoreBtn.isVisible({ timeout: 2000 })) {
        await loadMoreBtn.scrollIntoViewIfNeeded();
        await loadMoreBtn.click();
        await jitteredDelay(2500, 1000);
        return true;
      }

      // Try URL-based pagination
      urlObj.searchParams.set('page', (currentPage + 1).toString());
      const nextUrl = urlObj.toString();

      // Navigate to next page
      await page.goto(nextUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await jitteredDelay(1500, 500);

      // Check if we got new results (not a redirect back to page 1)
      const newUrlObj = new URL(page.url());
      const newPage = parseInt(newUrlObj.searchParams.get('page') ?? '1', 10);
      return newPage > currentPage;
    } catch {
      return false;
    }
  }
}
