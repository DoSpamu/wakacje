import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { RawOffer, ProviderCode, SearchFilter } from '@wakacje/shared';
import { logger } from './logger.js';
import { withRetry, jitteredDelay } from './retry.js';
import { RateLimiter } from './RateLimiter.js';
import type {
  ScraperResult,
  ScraperError,
  BrowserConfig,
  ScrapeContext,
} from './types.js';
import { DEFAULT_BROWSER_CONFIG } from './types.js';

/**
 * Abstract base class for all provider scrapers.
 *
 * Each provider creates a subclass implementing:
 *   - buildSearchUrls(filter) → string[]
 *   - parsePage(page, url) → RawOffer[]
 *   - handlePagination(page) → boolean (returns true if there is a next page)
 */
export abstract class BaseScraper {
  protected abstract readonly providerCode: ProviderCode;
  protected abstract readonly baseUrl: string;
  protected abstract readonly selectors: Record<string, string>;

  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected rateLimiter: RateLimiter;
  protected config: BrowserConfig;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...config };
    this.rateLimiter = new RateLimiter({
      requestsPerWindow: 8,
      windowMs: 60_000,
      minDelayMs: parseInt(process.env['SCRAPER_DELAY_MS'] ?? '2000', 10),
    });
  }

  /** Launch browser and create context with realistic fingerprint */
  async init(): Promise<void> {
    const launcher = { chromium, firefox, webkit }[this.config.browser];
    this.browser = await launcher.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1366, height: 768 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw',
      extraHTTPHeaders: {
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    // Block heavy resources to speed up loading
    await this.context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf}', (route) =>
      route.abort(),
    );

    logger.info('Browser initialized', { browser: this.config.browser }, this.providerCode);
  }

  /** Close browser and release resources */
  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    logger.info('Browser closed', undefined, this.providerCode);
  }

  /** Main entry point — runs the full scrape for a given filter */
  async scrape(ctx: ScrapeContext): Promise<ScraperResult> {
    const startTime = Date.now();
    const errors: ScraperError[] = [];
    const allOffers: RawOffer[] = [];
    let pagesVisited = 0;

    try {
      await this.init();

      const urls = this.buildSearchUrls(ctx.filter);
      logger.info(`Starting scrape — ${urls.length} search URL(s)`, undefined, this.providerCode);

      for (const url of urls) {
        try {
          const pageOffers = await withRetry(
            async () => {
              await this.rateLimiter.acquire();
              const page = await this.context!.newPage();
              page.setDefaultTimeout(this.config.timeout);

              try {
                return await this.scrapeUrl(page, url, ctx);
              } finally {
                await page.close();
              }
            },
            {
              maxRetries: parseInt(process.env['SCRAPER_MAX_RETRIES'] ?? '3', 10),
              onRetry: (attempt, err) => {
                logger.warn(`Retry ${attempt} for ${url}`, { error: err.message }, this.providerCode);
              },
            },
          );

          allOffers.push(...pageOffers.offers);
          pagesVisited += pageOffers.pages;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          errors.push({
            url,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            retryable: false,
          });
          logger.error(`Failed to scrape ${url}`, { error: error.message }, this.providerCode);
        }
      }
    } finally {
      await this.close();
    }

    const result: ScraperResult = {
      providerCode: this.providerCode,
      searchRunId: ctx.searchRunId,
      offers: allOffers,
      errors,
      duration: Date.now() - startTime,
      pagesVisited,
    };

    logger.info(
      `Scrape complete: ${allOffers.length} offers, ${errors.length} errors, ${pagesVisited} pages`,
      undefined,
      this.providerCode,
    );

    return result;
  }

  /** Scrape a single URL with pagination handling */
  private async scrapeUrl(
    page: Page,
    url: string,
    ctx: ScrapeContext,
  ): Promise<{ offers: RawOffer[]; pages: number }> {
    const offers: RawOffer[] = [];
    let pages = 0;

    logger.info(`Navigating to ${url}`, undefined, this.providerCode);
    await page.goto(url, { waitUntil: 'networkidle', timeout: this.config.timeout });
    await jitteredDelay(1500, 1000);

    // Save snapshot if enabled
    if (ctx.saveSnapshots) {
      await this.saveSnapshot(page, ctx.snapshotDir, url);
    }

    // Handle cookie consent dialogs
    await this.handleCookieConsent(page);

    // Wait for results container
    await this.waitForResults(page);

    // Track seen offer keys — deduplicates "load more" reparsing of existing DOM cards
    const seen = new Set<string>();
    const addNew = (batch: RawOffer[]): number => {
      let added = 0;
      for (const o of batch) {
        const key = `${o.hotelName}|${o.departureDate}|${o.departureAirport}|${o.priceTotal}`;
        if (!seen.has(key)) { seen.add(key); offers.push(o); added++; }
      }
      return added;
    };

    // Parse first page
    const firstPageOffers = await this.parsePage(page, url);
    addNew(firstPageOffers);
    pages++;

    logger.info(`Page ${pages}: ${firstPageOffers.length} offers`, undefined, this.providerCode);

    // Handle pagination
    let hasMore = true;
    let noNewStreak = 0;
    while (hasMore) {
      hasMore = await this.goToNextPage(page);
      if (hasMore) {
        await this.rateLimiter.acquire();
        await this.waitForResults(page);
        const nextOffers = await this.parsePage(page, page.url());
        const newCount = addNew(nextOffers);
        pages++;
        logger.info(
          `Page ${pages}: ${nextOffers.length} offers (${newCount} new)`,
          undefined,
          this.providerCode,
        );

        // Stop if no new unique offers appear (avoids infinite "load more" loops)
        if (newCount === 0) {
          noNewStreak++;
          if (noNewStreak >= 2) {
            logger.debug('No new offers on 2 consecutive pages — stopping', undefined, this.providerCode);
            break;
          }
        } else {
          noNewStreak = 0;
        }

        // Safety limit
        if (pages >= 20) {
          logger.warn('Reached page limit (20), stopping pagination', undefined, this.providerCode);
          break;
        }
      }
    }

    return { offers, pages };
  }

  /** Save HTML snapshot for debugging */
  private async saveSnapshot(page: Page, dir: string, url: string): Promise<void> {
    try {
      await mkdir(dir, { recursive: true });
      const filename = `${this.providerCode}_${Date.now()}.html`;
      const html = await page.content();
      await writeFile(join(dir, filename), html, 'utf-8');
      logger.debug(`Saved snapshot: ${filename}`, undefined, this.providerCode);
    } catch (err) {
      logger.warn('Failed to save snapshot', { error: String(err) }, this.providerCode);
    }
  }

  /** Try to dismiss cookie consent banners */
  protected async handleCookieConsent(page: Page): Promise<void> {
    const selectors = [
      // Common Polish/EU cookie consent patterns
      'button:has-text("Akceptuj")',
      'button:has-text("Akceptuję")',
      'button:has-text("Zgadzam się")',
      'button:has-text("Przyjmuję")',
      'button:has-text("Accept")',
      'button:has-text("Accept all")',
      '#onetrust-accept-btn-handler',
      '.cookie-accept',
      '[data-testid="cookie-accept"]',
    ];

    for (const selector of selectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          logger.debug(`Dismissed cookie consent: ${selector}`, undefined, this.providerCode);
          await jitteredDelay(500, 300);
          return;
        }
      } catch {
        // Selector not found — continue
      }
    }
  }

  /** Abstract methods — implemented per provider */
  protected abstract buildSearchUrls(filter: SearchFilter): string[];
  protected abstract parsePage(page: Page, url: string): Promise<RawOffer[]>;
  protected abstract waitForResults(page: Page): Promise<void>;
  protected abstract goToNextPage(page: Page): Promise<boolean>;
}
