#!/usr/bin/env node
/**
 * CLI entry point for the scraper.
 *
 * Usage:
 *   pnpm scrape            # scrape all providers
 *   pnpm scrape:rpl        # scrape only r.pl
 *   pnpm scrape:exim       # scrape only Exim Tours
 *   pnpm scrape:itaka      # scrape only Itaka
 *
 * Environment: set via .env file or environment variables
 */

import 'dotenv/config';
import { runScrape, ALL_PROVIDERS, type SupportedProvider } from './orchestrator.js';
import type { SearchFilter } from '@wakacje/shared';

async function main() {
  const args = process.argv.slice(2);
  const providerArg = args[0]?.toLowerCase();

  let providers: SupportedProvider[];

  if (!providerArg || providerArg === 'all') {
    providers = ALL_PROVIDERS;
  } else {
    const requested = providerArg.split(',') as SupportedProvider[];
    providers = requested.filter((p): p is SupportedProvider =>
      ALL_PROVIDERS.includes(p as SupportedProvider),
    );

    if (providers.length === 0) {
      console.error(`Unknown providers: ${providerArg}. Available: ${ALL_PROVIDERS.join(', ')}`);
      process.exit(1);
    }
  }

  // Build filter from environment or defaults
  const today = new Date();
  const twoMonthsLater = new Date(today);
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

  const filter: Partial<SearchFilter> = {
    destinations: (process.env['SCRAPE_DESTINATIONS']?.split(',') ?? [
      'turkey',
      'egypt',
      'greece',
      'spain',
      'cyprus',
    ]) as SearchFilter['destinations'],

    departureAirports: (process.env['SCRAPE_AIRPORTS']?.split(',') ?? ['KTW', 'KRK']) as SearchFilter['departureAirports'],

    departureDateFrom: process.env['SCRAPE_DATE_FROM'] ?? today.toISOString().split('T')[0]!,
    departureDateTo: process.env['SCRAPE_DATE_TO'] ?? twoMonthsLater.toISOString().split('T')[0]!,

    nights: {
      min: parseInt(process.env['SCRAPE_NIGHTS_MIN'] ?? '7', 10),
      max: parseInt(process.env['SCRAPE_NIGHTS_MAX'] ?? '14', 10),
    },

    adults: parseInt(process.env['SCRAPE_ADULTS'] ?? '2', 10),
    children: parseInt(process.env['SCRAPE_CHILDREN'] ?? '0', 10),

    hotelStars: (process.env['SCRAPE_STARS']
      ?.split(',')
      .map(Number) ?? [4, 5]) as SearchFilter['hotelStars'],

    boardTypes: (process.env['SCRAPE_BOARD_TYPES']?.split(',') ?? [
      'all-inclusive',
      'ultra-all-inclusive',
    ]) as SearchFilter['boardTypes'],
  };

  console.info(`\n🚀 Starting scrape: ${providers.join(', ')}\n`);

  try {
    const result = await runScrape({
      filter,
      providers,
      runEnrichment: process.env['ENABLE_ENRICHMENT'] !== 'false',
      concurrency: parseInt(process.env['SCRAPER_CONCURRENCY'] ?? '2', 10),
    });

    console.info('\n✅ Scrape complete:');
    console.info(`   Offers scraped:  ${result.totalOffersScraped}`);
    console.info(`   Offers inserted: ${result.totalOffersInserted}`);
    console.info(`   Hotels created:  ${result.hotelsCreated}`);
    console.info(`   Hotels matched:  ${result.hotelsMatched}`);
    console.info(`   Enriched hotels: ${result.enrichedHotels}`);
    console.info(`   Duration:        ${(result.durationMs / 1000).toFixed(1)}s`);

    if (result.errors.length > 0) {
      console.warn('\n⚠️  Errors:');
      result.errors.forEach((e) => console.warn(`   ${e}`));
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
