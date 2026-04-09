import type { Page, Route } from 'playwright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { translateToExim } from '../../base/filterTranslator.js';
import { parseEximPage, parseEximApiResponse } from './parser.js';
import { EXIM_SELECTORS, EXIM_CONFIG } from './config.js';

export class EximScraper extends BaseScraper {
  readonly providerCode = 'exim' as const;
  readonly baseUrl = 'https://www.exim.pl';
  readonly selectors = EXIM_SELECTORS;

  /** Stores API-intercepted offer data */
  private interceptedOffers: RawOffer[] = [];

  protected buildSearchUrls(filter: SearchFilter): string[] {
    const translated = translateToExim(filter);
    return translated.map(({ baseUrl, params }) => `${baseUrl}?${params.toString()}`);
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    // If we intercepted API data, use it (more reliable than DOM parsing)
    if (this.interceptedOffers.length > 0) {
      const offers = [...this.interceptedOffers];
      this.interceptedOffers = [];
      logger.info(`Using ${offers.length} offers from API interception`, undefined, 'exim');
      return offers;
    }

    // Fallback: DOM parsing
    return parseEximPage(page, url);
  }

  /** Override init to set up broad API response interception */
  async init(): Promise<void> {
    await super.init();

    if (!this.context) return;

    // Intercept ALL fetch/XHR responses and try to extract offer data from JSON
    const tryIntercept = async (route: Route) => {
      const response = await route.fetch();
      try {
        const contentType = response.headers()['content-type'] ?? '';
        if (contentType.includes('json')) {
          const json = await response.json();
          const offers = parseEximApiResponse(json);
          if (offers.length > 0) {
            logger.debug(`Intercepted ${offers.length} Exim offers from API`, undefined, 'exim');
            this.interceptedOffers.push(...offers);
          }
        }
      } catch {
        // Not parseable — ignore
      }
      await route.fulfill({ response });
    };

    // Cast the handler to satisfy Playwright's overloaded types
    const handler = tryIntercept as Parameters<typeof this.context.route>[1];
    await this.context.route(EXIM_CONFIG.apiPattern, handler);
    await this.context.route('**/search**', handler);
    await this.context.route('**/oferty**', handler);
    await this.context.route('**/pakiety**', handler);
    await this.context.route('**/wyniki**', handler);
    await this.context.route('**/*.json*', handler);
  }

  protected async waitForResults(page: Page): Promise<void> {
    // Wait for networkidle so all API calls have fired
    try {
      await page.waitForLoadState('networkidle', { timeout: EXIM_CONFIG.resultsTimeout });
    } catch {
      // Timeout — continue
    }

    // Extra settle time for dynamic rendering
    await jitteredDelay(3000, 1000);

    // Best-effort wait for DOM cards
    try {
      await Promise.race([
        page.waitForSelector(EXIM_SELECTORS.offerCard, { timeout: 10_000 }),
        page.waitForSelector(EXIM_SELECTORS.noResults, { timeout: 10_000 }),
      ]);
    } catch {
      logger.warn('Timeout waiting for Exim DOM results (using intercepted API data if available)', undefined, 'exim');
    }
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      // Try "load more" button
      const loadMore = page.locator(EXIM_SELECTORS.loadMoreBtn).first();
      if (await loadMore.isVisible({ timeout: 2000 })) {
        const prevCount = await page.locator(EXIM_SELECTORS.offerCard).count();
        await loadMore.scrollIntoViewIfNeeded();
        await loadMore.click();
        await jitteredDelay(2500, 1000);

        // Wait for new offers to appear
        const newCount = await page.locator(EXIM_SELECTORS.offerCard).count();
        return newCount > prevCount;
      }

      // Try pagination next button
      const nextBtn = page.locator(EXIM_SELECTORS.paginationNext).first();
      if (await nextBtn.isVisible({ timeout: 2000 })) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        await jitteredDelay(1500, 500);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }
}
