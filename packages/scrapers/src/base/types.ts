import type { RawOffer } from '@wakacje/shared';
import type { ProviderCode, SearchFilter } from '@wakacje/shared';

/** Result returned by each provider scraper */
export interface ScraperResult {
  providerCode: ProviderCode;
  searchRunId: string;
  offers: RawOffer[];
  errors: ScraperError[];
  duration: number;
  pagesVisited: number;
}

export interface ScraperError {
  url?: string;
  message: string;
  stack?: string;
  timestamp: string;
  retryable: boolean;
}

/** Playwright browser config */
export interface BrowserConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  timeout: number;
  userAgent?: string;
}

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  browser: (process.env['SCRAPER_BROWSER'] as BrowserConfig['browser']) ?? 'chromium',
  headless: process.env['SCRAPER_HEADLESS'] !== 'false',
  timeout: parseInt(process.env['SCRAPER_TIMEOUT_MS'] ?? '60000', 10),
  // Realistic browser user agent
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export interface ScrapeContext {
  filter: SearchFilter;
  searchRunId: string;
  saveSnapshots: boolean;
  snapshotDir: string;
}
