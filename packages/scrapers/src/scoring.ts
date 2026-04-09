/**
 * Composite score calculator.
 *
 * Produces a 0–100 score for each offer based on:
 * - Price (normalized within the result set)
 * - TripAdvisor/Google ratings
 * - Food quality
 * - Rooms/cleanliness
 * - Hotel stars
 * - Review count confidence
 * - Price/quality ratio
 */

import type { ScoringConfig } from '@wakacje/shared';
import { DEFAULT_SCORING_CONFIG } from '@wakacje/shared';

export interface OfferScoringInput {
  priceTotal: number;
  hotelStars: number;
  overallRating: number | null;
  foodScore: number | null;
  roomsScore: number | null;
  cleanlinessScore: number | null;
  reviewCount: number | null;
}

export interface OfferScoringContext {
  minPrice: number;
  maxPrice: number;
}

/**
 * Clamp value between 0 and 1
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Normalize price: lower price = higher score
 */
function normalizePriceScore(price: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return clamp01(1 - (price - min) / (max - min));
}

/**
 * Normalize rating to 0–1 scale
 */
function normalizeRating(rating: number | null, scale: number): number {
  if (rating === null) return 0.5; // neutral when unknown
  return clamp01(rating / scale);
}

/**
 * Log-normalize review count for confidence weight
 */
function normalizeReviewCount(count: number | null, logBase: number, max: number): number {
  if (count === null || count <= 0) return 0;
  return clamp01(Math.log(count + 1) / Math.log(max + 1));
}

/**
 * Compute composite score (0–100) for a single offer.
 */
export function computeCompositeScore(
  input: OfferScoringInput,
  context: OfferScoringContext,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const { weights, normalization } = config;

  const priceScore = normalizePriceScore(
    input.priceTotal,
    context.minPrice,
    context.maxPrice,
  );

  const ratingScore = normalizeRating(input.overallRating, normalization.ratingScale);
  const foodScore = normalizeRating(input.foodScore, normalization.ratingScale);
  const roomsScore = normalizeRating(input.roomsScore, normalization.ratingScale);
  const hotelStarsScore = clamp01((input.hotelStars - 3) / 2); // 3★=0, 4★=0.5, 5★=1
  const reviewCountScore = normalizeReviewCount(
    input.reviewCount,
    normalization.reviewCountLogBase,
    normalization.reviewCountMax,
  );

  // Price/quality ratio: quality = average of available quality scores
  const qualityScores = [ratingScore, foodScore, roomsScore].filter((s) => s !== 0.5);
  const avgQuality = qualityScores.length > 0
    ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
    : 0.5;

  const priceQualityScore = clamp01(avgQuality / Math.max(0.1, priceScore + 0.01));

  const rawScore =
    weights.priceNormalized * priceScore +
    weights.overallRating * ratingScore +
    weights.foodScore * foodScore +
    weights.roomsScore * roomsScore +
    weights.hotelStars * hotelStarsScore +
    weights.reviewCountLog * reviewCountScore +
    weights.priceQualityRatio * Math.min(1, priceQualityScore);

  return Math.round(rawScore * 100);
}

/**
 * Compute scores for a batch of offers and return offer IDs with scores.
 * Takes price context from the batch itself.
 */
export function scoreBatch(
  offers: Array<OfferScoringInput & { id: string }>,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): Array<{ offerId: string; score: number }> {
  if (offers.length === 0) return [];

  const prices = offers.map((o) => o.priceTotal);
  const context: OfferScoringContext = {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };

  return offers.map((offer) => ({
    offerId: offer.id,
    score: computeCompositeScore(offer, context, config),
  }));
}
