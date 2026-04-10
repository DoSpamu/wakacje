import type { Page } from 'patchright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { parseGrecosPage } from './parser.js';
import { GRECOS_SELECTORS, GRECOS_CONFIG, GRECOS_STARS_MAP, GRECOS_BOARD_MAP } from './config.js';

export class GrecosScraper extends BaseScraper {
  readonly providerCode = 'grecos' as const;
  readonly baseUrl = 'https://www.grecos.pl';
  readonly selectors = GRECOS_SELECTORS;

  /**
   * Build Grecos search URL.
   *
   * Reference:
   * https://www.grecos.pl/wakacje?From=KTW,KRK&Adults=2&Children=0
   *   &DurationInterval=6:9&DateOfDeparture=20260409&DateOfReturn=20260530
   *   &PriceFrom=0&PriceTo=50000&PriceType=man&ObjectType=H,R,AP
   *   &HotelStandard=50,45,40&BoardStandards=1
   */
  protected buildSearchUrls(filter: SearchFilter): string[] {
    const formatDateGrecos = (iso: string): string => iso.replace(/-/g, '');

    const params = new URLSearchParams();

    params.set('From', filter.departureAirports.join(','));
    params.set('Adults', filter.adults.toString());
    params.set('Children', filter.children.toString());
    params.set('DurationInterval', `${filter.nights.min - 1}:${filter.nights.max}`);
    params.set('DateOfDeparture', formatDateGrecos(filter.departureDateFrom));
    params.set('DateOfReturn', formatDateGrecos(filter.departureDateTo));
    params.set('PriceFrom', (filter.priceMin ?? 0).toString());
    params.set('PriceTo', (filter.priceMax ?? 50000).toString());
    params.set('PriceType', 'man');
    params.set('ObjectType', 'H,R,AP');

    // Stars
    const starValues = filter.hotelStars
      .flatMap((s) => (GRECOS_STARS_MAP[s] ?? '').split(','))
      .filter(Boolean);
    if (starValues.length > 0) {
      params.set('HotelStandard', starValues.join(','));
    }

    // Board types
    const boardValues = filter.boardTypes
      .map((b) => GRECOS_BOARD_MAP[b])
      .filter(Boolean) as string[];
    if (boardValues.length > 0) {
      params.set('BoardStandards', boardValues[0]!);
    }

    const url = `${GRECOS_CONFIG.baseUrl}${GRECOS_CONFIG.searchPath}?${params.toString()}`;
    logger.info(`Built Grecos search URL`, { url }, 'grecos');
    return [url];
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    return parseGrecosPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    try {
      await page.waitForSelector(GRECOS_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: GRECOS_CONFIG.resultsTimeout,
      });
    } catch { /* no spinner */ }

    try {
      await Promise.race([
        page.waitForSelector(GRECOS_SELECTORS.offerCard, { timeout: GRECOS_CONFIG.resultsTimeout }),
        page.waitForSelector(GRECOS_SELECTORS.noResults, { timeout: GRECOS_CONFIG.resultsTimeout }),
      ]);
    } catch {
      logger.warn('Timeout waiting for Grecos results', undefined, 'grecos');
    }

    await jitteredDelay(1500, 500);
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      const loadMore = page.locator(GRECOS_SELECTORS.loadMoreBtn).first();
      if (await loadMore.isVisible({ timeout: 2000 })) {
        const prev = await page.locator(GRECOS_SELECTORS.offerCard).count();
        await loadMore.scrollIntoViewIfNeeded();
        await loadMore.click();
        await jitteredDelay(2500, 1000);
        const curr = await page.locator(GRECOS_SELECTORS.offerCard).count();
        return curr > prev;
      }
      return false;
    } catch {
      return false;
    }
  }
}
