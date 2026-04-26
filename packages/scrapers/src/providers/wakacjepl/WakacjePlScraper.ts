import type { Page } from 'patchright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { DESTINATIONS } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { logger } from '../../base/logger.js';
import { parseWakacjePlNextData } from './parser.js';

const BASE_URL = 'https://www.wakacje.pl';

export class WakacjePlScraper extends BaseScraper {
  readonly providerCode = 'wakacjepl' as const;
  readonly baseUrl = BASE_URL;
  readonly selectors = {};

  protected buildSearchUrls(filter: SearchFilter): string[] {
    const destinations = filter.destinations?.length ? filter.destinations : Object.keys(DESTINATIONS);
    const urls: string[] = [];

    for (const dest of destinations) {
      const mapping = DESTINATIONS[dest as keyof typeof DESTINATIONS]?.providers?.wakacjepl;
      if (!mapping) continue;
      // ?all-inclusive is a valueless flag; &src=fromFilters mimics the UI flow
      urls.push(`${BASE_URL}/wczasy/${mapping.slug}/?all-inclusive&src=fromFilters`);
    }

    return urls;
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    const nextDataText: string | null = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el?.textContent ?? null;
    });

    if (!nextDataText) {
      logger.warn('__NEXT_DATA__ not found on page', { url }, 'wakacjepl');
      return [];
    }

    try {
      const parsed = JSON.parse(nextDataText);
      const offers = parseWakacjePlNextData(parsed, url);
      logger.info(`Parsed ${offers.length} offers from __NEXT_DATA__`, { url }, 'wakacjepl');
      return offers;
    } catch (err) {
      logger.warn('Failed to parse __NEXT_DATA__', { error: String(err), url }, 'wakacjepl');
      return [];
    }
  }

  protected async waitForResults(page: Page): Promise<void> {
    // SSR page — content is already rendered on load; no dynamic wait needed
    try {
      await page.waitForSelector('#__NEXT_DATA__', { timeout: 15_000 });
    } catch {
      logger.warn('Timed out waiting for __NEXT_DATA__', undefined, 'wakacjepl');
    }
  }

  protected async goToNextPage(_page: Page): Promise<boolean> {
    // SSR-only approach: the initial page carries 10 offers per destination.
    // Pagination via the thor.wakacje.pl API endpoint is not yet implemented.
    return false;
  }
}
