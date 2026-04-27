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
 *   pnpm enrich 20 --force    # re-enrich even if already done
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env vars: YOUTUBE_API_KEY, SCRAPER_HEADLESS, ENRICHMENT_DELAY_MS
 */

import 'dotenv/config';
import { TripAdvisorEnricher } from './enrichment/TripAdvisorEnricher.js';
import { BookingReviewEnricher } from './enrichment/BookingReviewEnricher.js';
import { YouTubeEnricher } from './enrichment/YouTubeEnricher.js';
import { supabase } from './db/supabase.js';
import {
  upsertHotelReviewSummary,
  insertHotelPhotos,
  updateHotelMedia,
  recalculateScores,
} from './db/queries.js';
import { logger } from './base/logger.js';

async function main() {
  const limitArg = parseInt(process.argv[2] ?? '50', 10);
  const forceArg = process.argv.includes('--force');

  console.info(`\n🔍 Enrichment run — limit: ${limitArg}, force: ${forceArg}\n`);

  // Step 1: find hotel IDs that already have a TripAdvisor review
  const alreadyEnrichedIds = new Set<string>();
  if (!forceArg) {
    const { data: existing } = await supabase
      .from('hotel_reviews_summary')
      .select('hotel_id')
      .eq('source', 'tripadvisor');
    for (const row of existing ?? []) alreadyEnrichedIds.add(row.hotel_id);
  }

  // Step 2: fetch hotels
  const { data: hotels, error } = await supabase
    .from('hotels')
    .select(
      'id, canonical_name, location_city, destinations(canonical_name)',
    )
    .limit(forceArg ? limitArg : limitArg + alreadyEnrichedIds.size); // over-fetch so we can filter

  if (error) {
    console.error('Failed to fetch hotels:', error.message);
    process.exit(1);
  }

  const hotelList = (hotels ?? [])
    .filter((h) => forceArg || !alreadyEnrichedIds.has(h.id))
    .slice(0, limitArg);

  if (hotelList.length === 0) {
    console.info('No hotels need enrichment.');
    process.exit(0);
  }

  console.info(`Found ${hotelList.length} hotels to enrich\n`);

  const taEnricher = new TripAdvisorEnricher();
  const bookingEnricher = new BookingReviewEnricher();
  const ytEnricher = new YouTubeEnricher();

  await taEnricher.init();
  await bookingEnricher.init();

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
          console.info(
            `     TA: ${result.tripadvisor.overallRating ?? '?'}/5, ${result.tripadvisor.reviewCount ?? 0} opinii`,
          );
        } else {
          console.info('     TA: brak danych — próba Booking.com');
          const bookingResult = await bookingEnricher.enrichHotel(hotel.id, hotel.canonical_name, location);
          if (bookingResult.booking) {
            await upsertHotelReviewSummary({ hotelId: hotel.id, ...bookingResult.booking });
            console.info(
              `     Booking: ${bookingResult.booking.overallRating ?? '?'}/5, ${bookingResult.booking.reviewCount ?? 0} opinii`,
            );
          } else {
            console.info('     Booking: brak danych');
          }
        }

        if (result.photos.length > 0) {
          await insertHotelPhotos(hotel.id, result.photos);
          await updateHotelMedia(hotel.id, { coverPhotoUrl: result.photos[0] });
          console.info(`     Zdjęcia: ${result.photos.length} zapisanych`);
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
        console.warn(`     ⚠ Błąd: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }
  } finally {
    await taEnricher.close();
    await bookingEnricher.close();
  }

  const logs = logger.flushBuffer();
  for (const l of logs.filter((x) => x.level === 'warn' || x.level === 'error')) {
    console.warn(`[${l.level}] ${l.message}`);
  }

  // Recalculate composite scores now that reviews are available
  if (enriched > 0) {
    process.stdout.write('\nPrzeliczam composite scores...');
    const updated = await recalculateScores();
    console.info(` zaktualizowano ${updated} ofert`);
  }

  console.info(`\n✅ Gotowe — wzbogacono: ${enriched}, błędy: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
