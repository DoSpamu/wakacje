import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '@wakacje/shared';

interface ScoringInput {
  priceTotal: number;
  hotelStars: number;
  overallRating: number | null;
  foodScore: number | null;
  roomsScore: number | null;
  cleanlinessScore: number | null;
  reviewCount: number | null;
}

interface ScoringContext {
  minPrice: number;
  maxPrice: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function computeScore(
  input: ScoringInput,
  context: ScoringContext,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const { weights, normalization } = config;

  const priceScore = context.maxPrice > context.minPrice
    ? clamp01(1 - (input.priceTotal - context.minPrice) / (context.maxPrice - context.minPrice))
    : 0.5;

  const norm = (v: number | null) =>
    v === null ? 0.5 : clamp01(v / normalization.ratingScale);

  const ratingScore = norm(input.overallRating);
  const foodScore = norm(input.foodScore);
  const roomsScore = norm(input.roomsScore);
  const hotelStarsScore = clamp01((input.hotelStars - 3) / 2);

  const reviewCount = input.reviewCount ?? 0;
  const reviewCountScore = reviewCount > 0
    ? clamp01(Math.log(reviewCount + 1) / Math.log(normalization.reviewCountMax + 1))
    : 0;

  const qualityScores = [ratingScore, foodScore, roomsScore].filter((s) => s !== 0.5);
  const avgQuality = qualityScores.length > 0
    ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
    : 0.5;
  const pqRatio = clamp01(avgQuality / Math.max(0.1, priceScore + 0.01));

  const raw =
    weights.priceNormalized * priceScore +
    weights.overallRating * ratingScore +
    weights.foodScore * foodScore +
    weights.roomsScore * roomsScore +
    weights.hotelStars * hotelStarsScore +
    weights.reviewCountLog * reviewCountScore +
    weights.priceQualityRatio * Math.min(1, pqRatio);

  return Math.round(raw * 100);
}

export function getScoreClass(score: number | null): string {
  if (score === null) return 'badge bg-slate-100 text-slate-500';
  if (score >= 80) return 'score-excellent';
  if (score >= 60) return 'score-good';
  if (score >= 40) return 'score-average';
  return 'score-poor';
}

export function getScoreLabel(score: number | null): string {
  if (score === null) return '–';
  if (score >= 80) return 'Wybitny';
  if (score >= 60) return 'Dobry';
  if (score >= 40) return 'Przeciętny';
  return 'Słaby';
}

export function formatRating(rating: number | null): string {
  if (rating === null) return '–';
  return rating.toFixed(1);
}

export function stars(count: number): string {
  return '★'.repeat(Math.min(5, count)) + '☆'.repeat(Math.max(0, 5 - count));
}
