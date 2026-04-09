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

  /** Override init to set up API response interception */
  async init(): Promise<void> {
    await super.init();

    if (!this.context) return;

    // Intercept JSON API responses that contain offer data
    await this.context.route(EXIM_CONFIG.apiPattern, async (route: Route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        const offers = parseEximApiResponse(json);
        if (offers.length > 0) {
          logger.debug(`Intercepted ${offers.length} offers from API`, undefined, 'exim');
          this.interceptedOffers.push(...offers);
        }
      } catch {
        // Not a JSON response or not offer data
      }
      await route.fulfill({ response });
    });

    // Also intercept common Exim API patterns
    await this.context.route('**/search**', async (route: Route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        const offers = parseEximApiResponse(json);
        if (offers.length > 0) {
          this.interceptedOffers.push(...offers);
        }
      } catch {
        // ignore
      }
      await route.fulfill({ response });
    });
  }

  protected async waitForResults(page: Page): Promise<void> {
    // Wait for spinner to disappear
    try {
      await page.waitForSelector(EXIM_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: EXIM_CONFIG.resultsTimeout,
      });
    } catch {
      // No spinner visible — OK
    }

    // Wait for at least one offer card or no-results
    try {
      await Promise.race([
        page.waitForSelector(EXIM_SELECTORS.offerCard, { timeout: EXIM_CONFIG.resultsTimeout }),
        page.waitForSelector(EXIM_SELECTORS.noResults, { timeout: EXIM_CONFIG.resultsTimeout }),
      ]);
    } catch {
      // Timeout — proceed anyway, might have intercepted via API
      logger.warn('Timeout waiting for Exim results (may still have API data)', undefined, 'exim');
    }

    // Small extra wait for dynamic content to settle
    await jitteredDelay(1500, 500);
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
