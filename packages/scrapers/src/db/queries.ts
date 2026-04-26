/**
 * Database query helpers for the scraper.
 * All writes go through service role — bypasses RLS.
 */

import { supabase } from './supabase.js';
import { logger } from '../base/logger.js';
import type { NormalizedOffer } from '../normalizer/OfferNormalizer.js';
import type { ExistingHotelRecord } from '../normalizer/HotelNormalizer.js';
import type { ProviderCode } from '@wakacje/shared';

// ─────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────

export async function getProviderByCode(code: ProviderCode): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('id')
    .eq('code', code)
    .single();

  if (error) {
    logger.warn(`Provider not found: ${code}`, { error: error.message });
    return null;
  }

  return data;
}

// ─────────────────────────────────────────────
//  Search runs
// ─────────────────────────────────────────────

export async function createSearchRun(
  providerId: string,
  searchParams: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('search_runs')
    .insert({
      provider_id: providerId,
      search_params: searchParams,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to create search run', { error: error.message });
    return null;
  }

  return data.id;
}

export async function updateSearchRun(
  id: string,
  updates: {
    status: string;
    offersFound?: number;
    errorMessage?: string;
    completedAt?: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from('search_runs')
    .update({
      status: updates.status,
      offers_found: updates.offersFound,
      error_message: updates.errorMessage,
      completed_at: updates.completedAt ?? new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    logger.warn('Failed to update search run', { error: error.message });
  }
}

// ─────────────────────────────────────────────
//  Destinations
// ─────────────────────────────────────────────

export async function getDestinationByCanonical(
  canonical: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('destinations')
    .select('id')
    .eq('canonical_name', canonical)
    .single();

  if (error) return null;
  return data;
}

// ─────────────────────────────────────────────
//  Hotels
// ─────────────────────────────────────────────

export async function getHotelsByDestination(
  destinationId: string,
): Promise<ExistingHotelRecord[]> {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, canonical_name, normalized_name, destination_id, stars')
    .eq('destination_id', destinationId);

  if (error) {
    logger.warn('Failed to fetch hotels', { error: error.message });
    return [];
  }

  return (data ?? []).map((h) => ({
    id: h.id,
    canonicalName: h.canonical_name,
    normalizedName: h.normalized_name,
    destinationId: h.destination_id ?? destinationId,
    stars: h.stars,
  }));
}

export async function upsertHotel(hotel: {
  canonicalName: string;
  normalizedName: string;
  destinationId: string | null;
  stars: number;
  locationCity?: string;
  locationRegion?: string;
}): Promise<string | null> {
  // Check if hotel exists by normalized name + destination
  const { data: existing } = await supabase
    .from('hotels')
    .select('id')
    .eq('normalized_name', hotel.normalizedName)
    .eq('destination_id', hotel.destinationId ?? '')
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('hotels')
    .insert({
      canonical_name: hotel.canonicalName,
      normalized_name: hotel.normalizedName,
      destination_id: hotel.destinationId,
      stars: hotel.stars,
      location_city: hotel.locationCity,
      location_region: hotel.locationRegion,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to insert hotel', { error: error.message, hotel: hotel.canonicalName });
    return null;
  }

  return data.id;
}

export async function upsertHotelAlias(alias: {
  hotelId: string;
  providerId: string;
  providerHotelName: string;
  providerHotelId?: string;
  confidenceScore: number;
}): Promise<void> {
  const { error } = await supabase.from('hotel_aliases').upsert(
    {
      hotel_id: alias.hotelId,
      provider_id: alias.providerId,
      provider_hotel_name: alias.providerHotelName,
      provider_hotel_id: alias.providerHotelId,
      confidence_score: alias.confidenceScore,
    },
    { onConflict: 'provider_id,provider_hotel_name' },
  );

  if (error) {
    logger.warn('Failed to upsert hotel alias', { error: error.message });
  }
}

// ─────────────────────────────────────────────
//  Offers
// ─────────────────────────────────────────────

export async function insertOffers(offers: NormalizedOffer[]): Promise<number> {
  if (offers.length === 0) return 0;

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < offers.length; i += batchSize) {
    const batch = offers.slice(i, i + batchSize).map((o) => ({
      search_run_id: o.searchRunId,
      provider_id: o.providerId,
      hotel_id: o.hotelId,
      provider_offer_id: o.providerOfferId,
      destination_id: o.destinationId,
      departure_airport: o.departureAirport,
      departure_date: o.departureDate,
      return_date: o.returnDate,
      nights: o.nights,
      hotel_name: o.hotelName,
      hotel_stars: o.hotelStars,
      hotel_location: o.hotelLocation,
      board_type: o.boardType,
      room_type: o.roomType,
      price_total: o.priceTotal,
      price_per_person: o.pricePerPerson,
      currency: o.currency,
      adults: o.adults,
      children: o.children,
      source_url: o.sourceUrl,
      raw_data: o.rawData,
      is_available: o.isAvailable,
      scraped_at: o.scrapedAt,
    }));

    const { error, count } = await supabase.from('offers').insert(batch, { count: 'exact' });

    if (error) {
      logger.error('Failed to insert offer batch', {
        error: error.message,
        batchStart: i,
        batchSize: batch.length,
      });
    } else {
      inserted += count ?? batch.length;
    }
  }

  return inserted;
}

// ─────────────────────────────────────────────
//  Reviews
// ─────────────────────────────────────────────

export async function upsertHotelReviewSummary(review: {
  hotelId: string;
  source: string;
  overallRating: number | null;
  reviewCount: number | null;
  foodScore: number | null;
  foodSummary: string | null;
  roomsScore: number | null;
  roomsSummary: string | null;
  cleanlinessScore: number | null;
  serviceScore: number | null;
  beachScore: number | null;
  sentimentTags: string[];
  reviewSnippets?: Array<{ text: string; rating: number | null }>;
  scrapedAt: string;
}): Promise<void> {
  const { error } = await supabase.from('hotel_reviews_summary').upsert(
    {
      hotel_id: review.hotelId,
      source: review.source,
      overall_rating: review.overallRating,
      review_count: review.reviewCount,
      food_score: review.foodScore,
      food_summary: review.foodSummary,
      rooms_score: review.roomsScore,
      rooms_summary: review.roomsSummary,
      cleanliness_score: review.cleanlinessScore,
      service_score: review.serviceScore,
      beach_score: review.beachScore,
      sentiment_tags: review.sentimentTags,
      review_snippets: review.reviewSnippets ?? [],
      scraped_at: review.scrapedAt,
    },
    { onConflict: 'hotel_id,source' },
  );

  if (error) {
    logger.warn('Failed to upsert review summary', { error: error.message, hotelId: review.hotelId });
  }
}

// ─────────────────────────────────────────────
//  Logs
// ─────────────────────────────────────────────

export async function insertScrapeLogs(
  logs: Array<{
    searchRunId?: string;
    providerId?: string;
    level: string;
    message: string;
    details?: unknown;
  }>,
): Promise<void> {
  if (logs.length === 0) return;

  const { error } = await supabase.from('scrape_logs').insert(
    logs.map((l) => ({
      search_run_id: l.searchRunId,
      provider_id: l.providerId,
      level: l.level,
      message: l.message,
      details: l.details as Record<string, unknown> | null,
    })),
  );

  if (error) {
    console.error('Failed to insert scrape logs:', error.message);
  }
}

// ─────────────────────────────────────────────
//  Maintenance
// ─────────────────────────────────────────────

export async function expireStuckRuns(): Promise<void> {
  try {
    await supabase.rpc('expire_stuck_search_runs');
  } catch { /* non-fatal */ }
}

/**
 * After a successful scrape, mark all previous offers from this provider
 * as unavailable. This ensures the DB stays fresh — old runs don't pollute results.
 */
export async function markProviderOffersUnavailable(
  providerId: string,
  currentSearchRunId: string,
): Promise<void> {
  const { error } = await supabase
    .from('offers')
    .update({ is_available: false })
    .eq('provider_id', providerId)
    .eq('is_available', true)
    .neq('search_run_id', currentSearchRunId);

  if (error) {
    logger.warn('Failed to mark old offers unavailable', { error: error.message, providerId });
  }
}

export async function recalculateScores(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('recalculate_composite_scores');
    if (error) {
      logger.warn('Score recalculation failed', { error: error.message });
      return 0;
    }
    return (data as number) ?? 0;
  } catch (err) {
    logger.warn('Score recalculation error', { error: String(err) });
    return 0;
  }
}

// ─────────────────────────────────────────────
//  Hotel media (photos + YouTube)
// ─────────────────────────────────────────────

export async function insertHotelPhotos(
  hotelId: string,
  urls: string[],
  source = 'tripadvisor',
): Promise<void> {
  if (urls.length === 0) return;

  // Skip if photos already exist for this hotel+source
  const { data: existing } = await supabase
    .from('hotel_photos')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('source', source)
    .limit(1);

  if (existing && existing.length > 0) return;

  const rows = urls.map((url, i) => ({
    hotel_id: hotelId,
    url,
    source,
    sort_order: i,
  }));

  const { error } = await supabase.from('hotel_photos').insert(rows);
  if (error) {
    logger.warn('Failed to insert hotel photos', { error: error.message, hotelId });
  }
}

export async function updateHotelMedia(
  hotelId: string,
  updates: { youtubeVideoId?: string | null; coverPhotoUrl?: string | null },
): Promise<void> {
  const dbUpdates: Record<string, string | null> = {};
  if (updates.youtubeVideoId !== undefined) dbUpdates['youtube_video_id'] = updates.youtubeVideoId;
  if (updates.coverPhotoUrl !== undefined) dbUpdates['cover_photo_url'] = updates.coverPhotoUrl;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase.from('hotels').update(dbUpdates).eq('id', hotelId);
  if (error) {
    logger.warn('Failed to update hotel media', { error: error.message, hotelId });
  }
}

export async function getHotelsWithoutMedia(limit = 50): Promise<
  Array<{ id: string; canonical_name: string; location_city: string | null; destination_canonical: string | null }>
> {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, canonical_name, location_city, destinations(canonical_name)')
    .is('youtube_video_id', null)
    .limit(limit);

  if (error) {
    logger.warn('Failed to fetch hotels without media', { error: error.message });
    return [];
  }

  return (data ?? []).map((h) => ({
    id: h.id,
    canonical_name: h.canonical_name,
    location_city: h.location_city,
    destination_canonical:
      (h.destinations as unknown as { canonical_name: string } | null)?.canonical_name ?? null,
  }));
}

// ─────────────────────────────────────────────
//  Scoring update
// ─────────────────────────────────────────────

/**
 * Find hotels whose normalized_name is similar to the given string.
 * Uses the pg_trgm find_similar_hotels SQL function and the GIN index.
 */
export async function findSimilarHotelsByName(
  normalizedName: string,
  destinationId: string | null,
  minSimilarity = 0.4,
  limit = 5,
): Promise<ExistingHotelRecord[]> {
  const { data, error } = await supabase.rpc('find_similar_hotels', {
    p_normalized_name: normalizedName,
    p_destination_id: destinationId ?? null,
    p_min_similarity: minSimilarity,
    p_limit: limit,
  });

  if (error) {
    logger.warn('find_similar_hotels RPC failed', { error: error.message });
    return [];
  }

  return (data ?? []).map((row: {
    id: string;
    canonical_name: string;
    normalized_name: string;
    destination_id: string;
    stars: number;
    similarity: number;
  }) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    destinationId: row.destination_id,
    stars: row.stars,
  }));
}

export async function updateOfferScores(
  scores: Array<{ offerId: string; compositeScore: number }>,
): Promise<void> {
  for (const { offerId, compositeScore } of scores) {
    await supabase
      .from('offers')
      .update({ composite_score: compositeScore })
      .eq('id', offerId);
  }
}
