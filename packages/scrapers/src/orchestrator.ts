/**
 * Scrape Orchestrator
 *
 * Coordinates the full scrape pipeline:
 * 1. Build search filter from config
 * 2. Run provider scrapers concurrently (with limits)
 * 3. Normalize & deduplicate raw offers
 * 4. Match hotels across providers
 * 5. Write to Supabase
 * 6. Trigger TripAdvisor enrichment for new hotels
 * 7. Compute and store composite scores
 */

import pLimit from 'p-limit';
import 'dotenv/config';

import type { SearchFilter, ProviderCode } from '@wakacje/shared';
import { DEFAULT_FILTER } from '@wakacje/shared';

import { RplScraper } from './providers/rpl/RplScraper.js';
import { EximScraper } from './providers/exim/EximScraper.js';
import { ItakaScraper } from './providers/itaka/ItakaScraper.js';
import { GrecosScraper } from './providers/grecos/GrecosScraper.js';
import { TuiScraper } from './providers/tui/TuiScraper.js';
import { TripAdvisorEnricher } from './enrichment/TripAdvisorEnricher.js';
import { YouTubeEnricher } from './enrichment/YouTubeEnricher.js';
import { normalizeOffer, inferCanonicalDestination } from './normalizer/OfferNormalizer.js';
import {
  findBestHotelMatch,
  generateCanonicalName,
  normalizeHotelName,
  CONFIDENCE_THRESHOLDS,
} from './normalizer/HotelNormalizer.js';
import {
  getProviderByCode,
  createSearchRun,
  updateSearchRun,
  getDestinationByCanonical,
  findSimilarHotelsByName,
  upsertHotel,
  upsertHotelAlias,
  insertOffers,
  markProviderOffersUnavailable,
  upsertHotelReviewSummary,
  insertHotelPhotos,
  updateHotelMedia,
  expireStuckRuns,
  recalculateScores,
  insertScrapeLogs,
} from './db/queries.js';
import { logger } from './base/logger.js';
import type { ScrapeContext, ScraperResult } from './base/types.js';

const MIN_OFFERS_SANITY = 5;
const RETRY_DELAYS_MS = [5_000, 10_000] as const;

/** Returns true if the offer count meets the minimum sanity threshold */
function validateProviderResult(offers: ScraperResult['offers'], providerCode: string): boolean {
  if (offers.length < MIN_OFFERS_SANITY) {
    logger.warn(`[${providerCode}] only ${offers.length} offers — below sanity threshold of ${MIN_OFFERS_SANITY}`);
    return false;
  }
  return true;
}

/** Run a scraper with up to 2 attempts; retry on hard throws or sanity-check failures */
async function scrapeWithRetry(
  scraper: { scrape(ctx: ScrapeContext): Promise<ScraperResult> },
  ctx: ScrapeContext,
  providerCode: string,
  maxAttempts = 2,
): Promise<ScraperResult> {
  let lastResult: ScraperResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await scraper.scrape(ctx);
      lastResult = result;

      if (validateProviderResult(result.offers, providerCode) || attempt === maxAttempts) {
        return result;
      }

      logger.info(`[${providerCode}] sanity check failed on attempt ${attempt}/${maxAttempts}, retrying`);
    } catch (err) {
      logger.warn(`[${providerCode}] attempt ${attempt}/${maxAttempts} threw: ${String(err)}`);
      if (attempt === maxAttempts) {
        return lastResult ?? {
          providerCode: providerCode as ScraperResult['providerCode'],
          searchRunId: ctx.searchRunId,
          offers: [],
          errors: [{ message: String(err), timestamp: new Date().toISOString(), retryable: false }],
          duration: 0,
          pagesVisited: 0,
        };
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!));
  }

  return lastResult!;
}

const PROVIDER_SCRAPERS = {
  rpl: RplScraper,
  exim: EximScraper,
  itaka: ItakaScraper,
  grecos: GrecosScraper,
  tui: TuiScraper,
} as const;

export type SupportedProvider = keyof typeof PROVIDER_SCRAPERS;
export const ALL_PROVIDERS = Object.keys(PROVIDER_SCRAPERS) as SupportedProvider[];

export interface OrchestratorOptions {
  filter?: Partial<SearchFilter>;
  providers?: SupportedProvider[];
  runEnrichment?: boolean;
  concurrency?: number;
  enrichLimit?: number;
}

export interface OrchestratorResult {
  totalOffersScraped: number;
  totalOffersInserted: number;
  hotelsCreated: number;
  hotelsMatched: number;
  enrichedHotels: number;
  errors: string[];
  durationMs: number;
}

export async function runScrape(options: OrchestratorOptions = {}): Promise<OrchestratorResult> {
  const startTime = Date.now();

  const filter: SearchFilter = {
    ...DEFAULT_FILTER,
    ...options.filter,
  };

  const providers = options.providers ?? ALL_PROVIDERS;
  const runEnrichment = options.runEnrichment ?? true;
  const concurrency = options.concurrency ?? 2;
  const enrichLimit = options.enrichLimit ?? 20;

  // Auto-expire stuck runs from previous failed scrapes
  await expireStuckRuns();

  logger.info('Starting scrape orchestration', {
    providers,
    destinations: filter.destinations,
    departureDateFrom: filter.departureDateFrom,
    departureDateTo: filter.departureDateTo,
    nights: filter.nights,
  });

  const limit = pLimit(concurrency);
  const errors: string[] = [];

  let totalOffersScraped = 0;
  let totalOffersInserted = 0;
  let hotelsCreated = 0;
  let hotelsMatched = 0;
  let enrichedHotels = 0;

  // Enricher instances (shared across providers)
  const enricher = runEnrichment ? new TripAdvisorEnricher() : null;
  if (enricher) await enricher.init();
  const youtubeEnricher = runEnrichment ? new YouTubeEnricher() : null;

  try {
    // Run all providers concurrently (with concurrency limit)
    const scrapeResults = await Promise.allSettled(
      providers.map((providerCode) =>
        limit(async () => {
          logger.info(`Starting provider: ${providerCode}`);

          // Get provider DB record
          const providerRecord = await getProviderByCode(providerCode as ProviderCode);
          if (!providerRecord) {
            logger.warn(`Provider ${providerCode} not found in DB — skipping`);
            return { providerCode, offers: [], searchRunId: null };
          }

          // Create search run record
          const searchRunId = await createSearchRun(
            providerRecord.id,
            filter as unknown as Record<string, unknown>,
          );

          if (!searchRunId) {
            return { providerCode, offers: [], searchRunId: null };
          }

          const ctx: ScrapeContext = {
            filter,
            searchRunId,
            saveSnapshots: process.env['SCRAPER_SAVE_SNAPSHOTS'] === 'true',
            snapshotDir: process.env['SCRAPER_SNAPSHOT_DIR'] ?? './snapshots',
          };

          const ScraperClass = PROVIDER_SCRAPERS[providerCode];
          const scraper = new ScraperClass();

          const result = await scrapeWithRetry(scraper, ctx, providerCode);

          // Update search run
          await updateSearchRun(searchRunId, {
            status: result.errors.length > 0 ? 'partial' : 'completed',
            offersFound: result.offers.length,
            completedAt: new Date().toISOString(),
          });

          // Flush logs to DB
          const logEntries = logger.flushBuffer();
          await insertScrapeLogs(
            logEntries.map((l) => ({
              searchRunId,
              providerId: providerRecord.id,
              level: l.level,
              message: l.message,
              details: l.details as Record<string, unknown> | undefined,
            })),
          );

          totalOffersScraped += result.offers.length;
          for (const e of result.errors) errors.push(`[${providerCode}] ${e.message}`);

          return { providerCode, offers: result.offers, searchRunId, providerId: providerRecord.id };
        }),
      ),
    );

    // Process each provider's results
    for (const settled of scrapeResults) {
      if (settled.status === 'rejected') {
        errors.push(String(settled.reason));
        continue;
      }

      const { providerCode, offers, searchRunId, providerId } = settled.value;
      if (!searchRunId || !providerId || offers.length === 0) continue;

      logger.info(`Processing ${offers.length} raw offers from ${providerCode}`);

      // Group by destination for efficient hotel lookup
      const offersByDestination = new Map<string, typeof offers>();

      for (const offer of offers) {
        const canonical = inferCanonicalDestination(offer.destinationRaw)
          ?? inferCanonicalDestination(offer.hotelLocation)
          ?? null;

        const key = canonical ?? '__unknown__';
        if (!offersByDestination.has(key)) offersByDestination.set(key, []);
        offersByDestination.get(key)!.push(offer);
      }

      const normalizedOffers: ReturnType<typeof normalizeOffer>[] = [];

      for (const [destKey, destOffers] of offersByDestination) {
        // Look up destination
        const destRecord = destKey !== '__unknown__'
          ? await getDestinationByCanonical(destKey)
          : null;

        const destinationId = destRecord?.id ?? null;

        for (const rawOffer of destOffers) {
          // Use pg_trgm DB function to find similar hotels (replaces Fuse.js client scan)
          const normalizedName = normalizeHotelName(rawOffer.hotelName);
          const candidates = destinationId
            ? await findSimilarHotelsByName(normalizedName, destinationId)
            : [];

          const match = findBestHotelMatch(rawOffer, candidates);

          let hotelId: string | null = null;

          if (!match.isNewHotel && match.existingHotelId) {
            hotelId = match.existingHotelId;
            hotelsMatched++;

            // Update alias if score improved
            if (match.confidenceScore >= CONFIDENCE_THRESHOLDS.LOW) {
              await upsertHotelAlias({
                hotelId,
                providerId,
                providerHotelName: rawOffer.hotelName,
                providerHotelId: rawOffer.providerOfferId,
                confidenceScore: match.confidenceScore,
              });
            }
          } else {
            // Create new hotel
            const canonicalName = generateCanonicalName(rawOffer);
            const normalizedForUpsert = normalizeHotelName(canonicalName);

            hotelId = await upsertHotel({
              canonicalName,
              normalizedName: normalizedForUpsert,
              destinationId,
              stars: rawOffer.hotelStars,
              locationCity: rawOffer.hotelLocation,
              locationRegion: rawOffer.destinationRaw,
            });

            if (hotelId) {
              hotelsCreated++;

              await upsertHotelAlias({
                hotelId,
                providerId,
                providerHotelName: rawOffer.hotelName,
                providerHotelId: rawOffer.providerOfferId,
                confidenceScore: 1.0, // Self-created
              });

              // Enrich new hotel (bounded per run)
              if (enricher && hotelId && enrichedHotels < enrichLimit) {
                try {
                  const enrichResult = await enricher.enrichHotel(
                    hotelId,
                    rawOffer.hotelName,
                    rawOffer.hotelLocation,
                  );

                  if (enrichResult.tripadvisor) {
                    await upsertHotelReviewSummary({
                      hotelId,
                      ...enrichResult.tripadvisor,
                    });
                    enrichedHotels++;
                  }

                  if (enrichResult.photos.length > 0) {
                    await insertHotelPhotos(hotelId, enrichResult.photos);
                    await updateHotelMedia(hotelId, { coverPhotoUrl: enrichResult.photos[0] });
                  }

                  // YouTube enrichment
                  if (youtubeEnricher?.isAvailable()) {
                    const videoId = await youtubeEnricher.findHotelVideo(
                      rawOffer.hotelName,
                      rawOffer.hotelLocation,
                    );
                    if (videoId) {
                      await updateHotelMedia(hotelId, { youtubeVideoId: videoId });
                    }
                  }
                } catch (err) {
                  logger.warn('Enrichment failed', { hotel: rawOffer.hotelName, error: String(err) });
                }
              }
            }
          }

          // Normalize the offer
          const normalized = normalizeOffer({
            rawOffer,
            searchRunId,
            providerId,
            hotelId,
            destinationId,
          });

          if (normalized) normalizedOffers.push(normalized);
        }
      }

      // Insert normalized offers
      const validOffers = normalizedOffers.filter(Boolean) as NonNullable<typeof normalizedOffers[0]>[];

      if (validOffers.length > 0) {
        const inserted = await insertOffers(validOffers);
        totalOffersInserted += inserted;
        logger.info(`Inserted ${inserted} offers for ${providerCode}`);

        // Mark old offers from this provider as unavailable — keeps DB fresh
        await markProviderOffersUnavailable(providerId, searchRunId);
        logger.info(`Expired old offers for ${providerCode}`);
      }
    }
  } finally {
    if (enricher) await enricher.close();
  }

  // Recalculate composite scores after all inserts + enrichment
  logger.info('Recalculating composite scores...');
  const scoresUpdated = await recalculateScores();
  logger.info(`Scores updated for ${scoresUpdated} offers`);

  const durationMs = Date.now() - startTime;

  const result: OrchestratorResult = {
    totalOffersScraped,
    totalOffersInserted,
    hotelsCreated,
    hotelsMatched,
    enrichedHotels,
    errors,
    durationMs,
  };

  logger.info('Scrape orchestration complete', result);
  return result;
}
