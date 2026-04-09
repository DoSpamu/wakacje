// Main exports from scrapers package
export { runScrape, ALL_PROVIDERS } from './orchestrator.js';
export type { OrchestratorOptions, OrchestratorResult, SupportedProvider } from './orchestrator.js';
export { computeCompositeScore, scoreBatch } from './scoring.js';
export { TripAdvisorEnricher } from './enrichment/TripAdvisorEnricher.js';
export { HotelNormalizer as HotelNormalizerUtils } from './normalizer/HotelNormalizer.js';
export { inferCanonicalDestination, normalizeOffer } from './normalizer/OfferNormalizer.js';
