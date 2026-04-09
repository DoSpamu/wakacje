/**
 * Scoring configuration.
 * All weights must sum to 1.0.
 *
 * Override via SCORING_CONFIG_PATH env variable pointing to a JSON file
 * with the same shape as ScoringConfig.
 */
export interface ScoringWeights {
  /** Price competitiveness — lower price relative to set = better. Weight: higher = cheaper offers win more */
  priceNormalized: number;
  /** TripAdvisor/Google overall rating (0–5 scale) */
  overallRating: number;
  /** Food quality score derived from reviews */
  foodScore: number;
  /** Rooms/cleanliness score */
  roomsScore: number;
  /** Hotel star rating (4 or 5 stars) */
  hotelStars: number;
  /** Number of reviews (log-normalized) — more reviews = more confidence */
  reviewCountLog: number;
  /** Price-quality ratio: quality / price normalized */
  priceQualityRatio: number;
}

export interface ScoringNormalization {
  /** Expected price range in PLN for normalization */
  priceMin: number;
  priceMax: number;
  /** Rating scale used by providers (typically 5 or 10) */
  ratingScale: number;
  /** Log base for review count normalization */
  reviewCountLogBase: number;
  /** Max review count to consider (for normalization ceiling) */
  reviewCountMax: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  normalization: ScoringNormalization;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    priceNormalized: 0.20,
    overallRating: 0.15,
    foodScore: 0.25,
    roomsScore: 0.18,
    hotelStars: 0.07,
    reviewCountLog: 0.05,
    priceQualityRatio: 0.10,
  },
  normalization: {
    priceMin: 2000,
    priceMax: 15000,
    ratingScale: 5,
    reviewCountLogBase: 10,
    reviewCountMax: 10000,
  },
};

/**
 * Validate that weights sum to approximately 1.0
 */
export function validateWeights(weights: ScoringWeights): boolean {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) < 0.001;
}

/**
 * Load scoring config from file or return default.
 * Call this at startup in the scraper/web app.
 */
export async function loadScoringConfig(configPath?: string): Promise<ScoringConfig> {
  if (!configPath) return DEFAULT_SCORING_CONFIG;

  try {
    const { readFile } = await import('fs/promises');
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ScoringConfig;

    if (!validateWeights(parsed.weights)) {
      console.warn('[scoring] Weights do not sum to 1.0, using defaults');
      return DEFAULT_SCORING_CONFIG;
    }

    return parsed;
  } catch {
    console.warn(`[scoring] Could not load config from ${configPath}, using defaults`);
    return DEFAULT_SCORING_CONFIG;
  }
}
