import type { Page } from 'patchright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { jitteredDelay } from '../../base/retry.js';
import { translateToRpl } from '../../base/filterTranslator.js';
import { parseRplPage, parseRplNextData } from './parser.js';
import { RPL_SELECTORS, RPL_CONFIG } from './config.js';

export class RplScraper extends BaseScraper {
  readonly providerCode = 'rpl' as const;
  readonly baseUrl = 'https://r.pl';

  readonly selectors = RPL_SELECTORS;

  protected buildSearchUrls(filter: SearchFilter): string[] {
    const translated = translateToRpl(filter);
    return translated.map(({ baseUrl, params }) => `${baseUrl}?${params.toString()}`);
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    const nextDataText: string | null = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el?.textContent ?? null;
    });
    if (nextDataText) {
      try {
        const offers = parseRplNextData(JSON.parse(nextDataText));
        if (offers.length > 0) return offers;
      } catch { /* fall through to DOM */ }
    }
    return parseRplPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    // Wait for spinner to disappear
    try {
      await page.waitForSelector(RPL_SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: RPL_CONFIG.resultsTimeout,
      });
    } catch {
      // Spinner might not be present — that's ok
    }

    // Wait for at least one offer card OR a no-results message
    try {
      await Promise.race([
        page.waitForSelector(RPL_SELECTORS.offerCard, { timeout: RPL_CONFIG.resultsTimeout }),
        page.waitForSelector(RPL_SELECTORS.noResults, { timeout: RPL_CONFIG.resultsTimeout }),
      ]);
    } catch {
      logger.warn('Timeout waiting for results or no-results on r.pl', undefined, 'rpl');
    }
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    try {
      // Check for "load more" button
      const loadMoreBtn = page.locator(RPL_SELECTORS.loadMoreBtn).first();
      if (await loadMoreBtn.isVisible({ timeout: 2000 })) {
        await loadMoreBtn.scrollIntoViewIfNeeded();
        await loadMoreBtn.click();
        await jitteredDelay(2000, 1000);
        await this.waitForResults(page);
        return true;
      }

      // Check for classic next page link
      const nextLink = page.locator('a[rel="next"], a:has-text("Następna"), button:has-text("Następna")').first();
      if (await nextLink.isVisible({ timeout: 2000 })) {
        await nextLink.click();
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
