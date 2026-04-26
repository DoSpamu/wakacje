#!/usr/bin/env node
/**
 * One-shot enrichment script — fills hotel_reviews_summary for hotels
 * that have no TripAdvisor data yet.
 *
 * Usage:
 *   pnpm --filter @wakacje/scrapers exec tsx src/tools/enrich-hotels.ts
 *   pnpm --filter @wakacje/scrapers exec tsx src/tools/enrich-hotels.ts --limit 5
 *   pnpm --filter @wakacje/scrapers exec tsx src/tools/enrich-hotels.ts --destination egypt
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { TripAdvisorEnricher } from '../enrichment/TripAdvisorEnricher.js';
import {
  upsertHotelReviewSummary,
  insertHotelPhotos,
  updateHotelMedia,
} from '../db/queries.js';
import { logger } from '../base/logger.js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
);

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const destIdx = args.indexOf('--destination');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? '10', 10) : 10;
const DEST_FILTER = destIdx !== -1 ? args[destIdx + 1] : null;

async function main() {
  logger.info(`Starting enrichment run (limit: ${LIMIT}${DEST_FILTER ? `, destination: ${DEST_FILTER}` : ''})`);

  // Find hotels without a TripAdvisor review summary
  let query = supabase
    .from('hotels')
    .select(`
      id,
      canonical_name,
      location_city,
      location_region,
      destinations!inner (canonical_name)
    `)
    .not('id', 'in', `(
      select hotel_id from hotel_reviews_summary where source = 'tripadvisor'
    )`)
    .limit(LIMIT);

  if (DEST_FILTER) {
    query = query.eq('destinations.canonical_name', DEST_FILTER);
  }

  const { data: hotels, error } = await query;

  if (error) {
    logger.warn('Failed to fetch hotels', { error: error.message });
    process.exit(1);
  }

  if (!hotels || hotels.length === 0) {
    logger.info('All hotels already have TripAdvisor data. Nothing to do.');
    return;
  }

  logger.info(`Found ${hotels.length} hotels without TripAdvisor data`);

  const enricher = new TripAdvisorEnricher();
  await enricher.init();

  let enriched = 0;
  let failed = 0;

  try {
    for (const hotel of hotels) {
      const location = [hotel.location_city, hotel.location_region].filter(Boolean).join(', ');

      logger.info(`Enriching: ${hotel.canonical_name} (${location})`);

      const result = await enricher.enrichHotel(hotel.id, hotel.canonical_name, location);

      if (result.tripadvisor) {
        await upsertHotelReviewSummary({
          hotelId: hotel.id,
          ...result.tripadvisor,
        });
        enriched++;
        logger.info(`  ✓ rating=${result.tripadvisor.overallRating}, reviews=${result.tripadvisor.reviewCount}`);
      } else {
        failed++;
        logger.warn(`  ✗ No data returned`);
      }

      if (result.photos.length > 0) {
        await insertHotelPhotos(hotel.id, result.photos);
        await updateHotelMedia(hotel.id, { coverPhotoUrl: result.photos[0] });
        logger.info(`  + ${result.photos.length} photos`);
      }
    }
  } finally {
    await enricher.close();
  }

  logger.info(`Done: ${enriched} enriched, ${failed} failed out of ${hotels.length} hotels`);
}

main().catch((err) => {
  logger.warn('Enrichment script failed', { error: String(err) });
  process.exit(1);
});
