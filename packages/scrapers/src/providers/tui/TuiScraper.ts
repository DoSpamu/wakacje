import type { Page } from 'playwright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { parseTuiPage } from './parser.js';
import { TUI_SELECTORS, TUI_CONFIG, TUI_BOARD_CODES, TUI_STARS_MAP } from './config.js';

export class TuiScraper extends BaseScraper {
  readonly providerCode = 'tui' as const;
  readonly baseUrl = 'https://www.tui.pl';
  readonly selectors = TUI_SELECTORS;

  /**
   * Build TUI search URL using their colon-separated query format.
   *
   * Reference:
   * q=:price:byPlane:T:a:KTW:a:KRK:dF:6:dT:8:ctAdult:2:ctChild:0:room:2
   *   :board:GT06-AI GT06-XX GT06-AIP:minHotelCategory:4s
   *   :tripAdvisorRating:defaultTripAdvisorRating
   */
  protected buildSearchUrls(filter: SearchFilter): string[] {
    // Build the TUI query string format
    const parts: string[] = [':price:byPlane:T'];

    // Airports
    for (const airport of filter.departureAirports) {
      parts.push(`:a:${airport}`);
    }

    // Duration: dF=from, dT=to (number of nights - 1 for TUI's format)
    parts.push(`:dF:${filter.nights.min - 1}`);
    parts.push(`:dT:${filter.nights.max - 1}`);

    // Passengers
    parts.push(`:ctAdult:${filter.adults}`);
    parts.push(`:ctChild:${filter.children}`);
    parts.push(':room:2');

    // Board types
    const boardCodes = filter.boardTypes
      .flatMap((b) => (TUI_BOARD_CODES[b] ?? '').split(' '))
      .filter(Boolean);
    if (boardCodes.length > 0) {
      // TUI uses space-separated board codes within the :board: segment
      // URL-encode spaces as %20
      parts.push(`:board:${boardCodes.join(' ')}`);
    }

    // Hotel category
    const minCategory = filter.hotelStars
      .sort()
      .map((s) => TUI_STARS_MAP[s])
      .filter(Boolean)[0];
    if (minCategory) {
      parts.push(`:minHotelCategory:${minCategory}`);
    }

    // Default TripAdvisor rating (required by TUI API)
    parts.push(':tripAdvisorRating:defaultTripAdvisorRating');
    parts.push(':beach_distance:defaultBeachDistance');
    parts.push(':flightDuration:defaultFlightDuration');
    parts.push(':tripType:WS');

    const q = encodeURIComponent(parts.join(''));
    const params = new URLSearchParams();
    params.set('q', decodeURIComponent(q)); // let URLSearchParams handle encoding
    params.set('fullPrice', 'false');

    // Add departure date range
    if (filter.departureDateFrom) {
      params.set('departureFrom', filter.departureDateFrom);
    }
    if (filter.departureDateTo) {
      params.set('departureTo', filter.departureDateTo);
    }

    const url = `${TUI_CONFIG.baseUrl}${TUI_CONFIG.searchPath}?q=${parts.join('')}&fullPrice=false`;
    logger.info(`Built TUI search URL`, { url }, 'tui');
    return [url];
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    return parseTuiPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    try {
      await page.waitForSelector(TUI_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: TUI_CONFIG.resultsTimeout,
      });
    } catch { /* no spinner */ }

    try {
      await Promise.race([
        page.waitForSelector(TUI_SELECTORS.offerCard, { timeout: TUI_CONFIG.resultsTimeout }),
        page.waitForSelector(TUI_SELECTORS.noResults, { timeout: TUI_CONFIG.resultsTimeout }),
      ]);
    } catch {
      logger.warn('Timeout waiting for TUI results', undefined, 'tui');
    }

    await jitteredDelay(2000, 1000);
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      const loadMore = page.locator(TUI_SELECTORS.loadMoreBtn).first();
      if (await loadMore.isVisible({ timeout: 2000 })) {
        const prev = await page.locator(TUI_SELECTORS.offerCard).count();
        await loadMore.scrollIntoViewIfNeeded();
        await loadMore.click();
        await jitteredDelay(3000, 1000);
        const curr = await page.locator(TUI_SELECTORS.offerCard).count();
        return curr > prev;
      }
      return false;
    } catch {
      return false;
    }
  }
}
