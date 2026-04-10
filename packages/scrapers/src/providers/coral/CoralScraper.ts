import { chromium } from 'patchright';
import type { Page, Route } from 'patchright';
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
    // Coral Travel uses Incapsula anti-bot — launch with stealth args
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1366, height: 768 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw',
      ignoreHTTPSErrors: true,  // dertouristik.cz has cert issues on CI
      extraHTTPHeaders: {
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Override automation-detection properties
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).chrome = { runtime: {} };
    });

    // Block images/fonts for speed (same as BaseScraper)
    await this.context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf}', (route) =>
      route.abort(),
    );

    logger.info('Browser initialized (stealth mode)', { browser: 'chromium' }, 'coral');

    // Intercept Coral Travel API responses
    await this.context.route('**/api/**', async (route: Route) => {
      let response;
      try {
        response = await route.fetch();
      } catch {
        // SSL / network error — let the browser handle it natively
        await route.continue().catch(() => undefined);
        return;
      }
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
