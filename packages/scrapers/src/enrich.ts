#!/usr/bin/env node
/**
 * Standalone enrichment script — enriches existing hotels with:
 * - TripAdvisor ratings (overall, food, rooms, cleanliness, service)
 * - Hotel photos from TripAdvisor
 * - YouTube promotional video (requires YOUTUBE_API_KEY)
 *
 * Usage:
 *   pnpm enrich               # enrich all hotels missing enrichment
 *   pnpm enrich 20            # enrich at most 20 hotels
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env vars: YOUTUBE_API_KEY, SCRAPER_HEADLESS, ENRICHMENT_DELAY_MS
 */

import 'dotenv/config';
import { TripAdvisorEnricher } from './enrichment/TripAdvisorEnricher.js';
import { YouTubeEnricher } from './enrichment/YouTubeEnricher.js';
import { supabase } from './db/supabase.js';
import {
  upsertHotelReviewSummary,
  insertHotelPhotos,
  updateHotelMedia,
} from './db/queries.js';
import { logger } from './base/logger.js';

async function main() {
  const limitArg = parseInt(process.argv[2] ?? '50', 10);
  const forceArg = process.argv.includes('--force');

  console.info(`\n🔍 Enrichment run — limit: ${limitArg}, force: ${forceArg}\n`);

  // Fetch hotels that need enrichment
  let query = supabase
    .from('hotels')
    .select(
      `id, canonical_name, location_city,
       destinations(canonical_name),
       hotel_reviews_summary(id)`,
    )
    .limit(limitArg);

  if (!forceArg) {
    // Only hotels without a TripAdvisor review yet
    query = query.is('hotel_reviews_summary.id', null);
  }

  const { data: hotels, error } = await query;

  if (error) {
    console.error('Failed to fetch hotels:', error.message);
    process.exit(1);
  }

  const hotelList = (hotels ?? []).filter((h) => {
    // When joining, hotel_reviews_summary may be an array — skip if it has data (unless forced)
    if (forceArg) return true;
    const reviews = h.hotel_reviews_summary as unknown as Array<unknown> | null;
    return !reviews || reviews.length === 0;
  });

  if (hotelList.length === 0) {
    console.info('No hotels need enrichment.');
    process.exit(0);
  }

  console.info(`Found ${hotelList.length} hotels to enrich\n`);

  const taEnricher = new TripAdvisorEnricher();
  const ytEnricher = new YouTubeEnricher();

  await taEnricher.init();

  let enriched = 0;
  let failed = 0;

  try {
    for (const hotel of hotelList) {
      const dest = hotel.destinations as unknown as { canonical_name: string } | null;
      const location = hotel.location_city ?? dest?.canonical_name ?? '';

      console.info(`  → ${hotel.canonical_name} (${location})`);

      try {
        const result = await taEnricher.enrichHotel(hotel.id, hotel.canonical_name, location);

        if (result.tripadvisor) {
          await upsertHotelReviewSummary({ hotelId: hotel.id, ...result.tripadvisor });
          console.info(`     TA: ${result.tripadvisor.overallRating ?? '?'}/5, ${result.tripadvisor.reviewCount ?? 0} reviews`);
        } else {
          console.info('     TA: no data');
        }

        if (result.photos.length > 0) {
          await insertHotelPhotos(hotel.id, result.photos);
          await updateHotelMedia(hotel.id, { coverPhotoUrl: result.photos[0] });
          console.info(`     Photos: ${result.photos.length} saved`);
        }

        if (ytEnricher.isAvailable()) {
          const videoId = await ytEnricher.findHotelVideo(hotel.canonical_name, location);
          if (videoId) {
            await updateHotelMedia(hotel.id, { youtubeVideoId: videoId });
            console.info(`     YT: https://youtube.com/watch?v=${videoId}`);
          }
        }

        enriched++;
      } catch (err) {
        console.warn(`     ⚠ Failed: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }
  } finally {
    await taEnricher.close();
  }

  const logs = logger.flushBuffer();
  if (logs.length > 0) {
    // Persist any logged warnings/errors
    for (const l of logs.filter((x) => x.level === 'warn' || x.level === 'error')) {
      console.warn(`[${l.level}] ${l.message}`);
    }
  }

  console.info(`\n✅ Done — enriched: ${enriched}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
