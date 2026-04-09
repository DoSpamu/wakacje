import type { Page, Route } from 'playwright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { translateToCoral } from '../../base/filterTranslator.js';
import { parseCoralPage, parseCoralApiResponse } from './parser.js';
import { CORAL_SELECTORS, CORAL_CONFIG } from './config.js';

export class CoralScraper extends BaseScraper {
  readonly providerCode = 'coral' as const;
  readonly baseUrl = 'https://www.coraltravel.pl';
  readonly selectors = CORAL_SELECTORS;

  private interceptedOffers: RawOffer[] = [];

  protected buildSearchUrls(filter: SearchFilter): string[] {
    const translated = translateToCoral(filter);
    return translated.map(({ baseUrl, params }) => `${baseUrl}?${params.toString()}`);
  }

  async init(): Promise<void> {
    await super.init();

    if (!this.context) return;

    // Intercept Coral Travel API responses
    await this.context.route('**/api/**', async (route: Route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        const offers = parseCoralApiResponse(json);
        if (offers.length > 0) {
          logger.debug(`Intercepted ${offers.length} Coral offers from API`, undefined, 'coral');
          this.interceptedOffers.push(...offers);
        }
      } catch {
        // not JSON or not offers
      }
      await route.fulfill({ response });
    });
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    if (this.interceptedOffers.length > 0) {
      const offers = [...this.interceptedOffers];
      this.interceptedOffers = [];
      return offers;
    }
    return parseCoralPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    try {
      await page.waitForSelector(CORAL_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: CORAL_CONFIG.resultsTimeout,
      });
    } catch {
      // no spinner
    }

    try {
      await Promise.race([
        page.waitForSelector(CORAL_SELECTORS.offerCard, { timeout: CORAL_CONFIG.resultsTimeout }),
        page.waitForSelector(CORAL_SELECTORS.noResults, { timeout: CORAL_CONFIG.resultsTimeout }),
      ]);
    } catch {
      logger.warn('Timeout waiting for Coral results', undefined, 'coral');
    }

    await jitteredDelay(1500, 500);
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      const loadMore = page.locator(CORAL_SELECTORS.loadMoreBtn).first();
      if (await loadMore.isVisible({ timeout: 2000 })) {
        const prevCount = await page.locator(CORAL_SELECTORS.offerCard).count();
        await loadMore.scrollIntoViewIfNeeded();
        await loadMore.click();
        await jitteredDelay(2500, 1000);
        const newCount = await page.locator(CORAL_SELECTORS.offerCard).count();
        return newCount > prevCount;
      }
      return false;
    } catch {
      return false;
    }
  }
}
