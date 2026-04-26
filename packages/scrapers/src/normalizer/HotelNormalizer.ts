/**
 * Hotel Normalizer
 *
 * Responsible for:
 * 1. Normalizing hotel names (remove suffixes, lowercase, etc.)
 * 2. Matching hotels across providers with fuzzy string matching
 * 3. Assigning confidence scores to matches
 * 4. Maintaining the hotels + hotel_aliases tables
 */

import type { RawOffer, BoardType } from '@wakacje/shared';

export interface NormalizedHotel {
  id: string;
  canonicalName: string;
  normalizedName: string;
  destinationCanonical: string;
  stars: number;
  aliases: Array<{
    providerCode: string;
    providerHotelName: string;
    confidenceScore: number;
  }>;
}

export interface HotelMatch {
  existingHotelId: string | null;
  confidenceScore: number;
  isNewHotel: boolean;
}

/** Common hotel name suffixes to strip for normalization */
const SUFFIXES_TO_STRIP = [
  /\s+(hotel|resort|beach|club|suites?|rooms?|apartments?|villas?|palace|grand|royal|luxury|boutique|spa|wellness)\s*/gi,
  /\s+(\d\*|\d star|\d-star)/gi,
  /\s+(all\s*inclusive|ai|ul\s*)\s*/gi,
  /\s+(ex|ex\.)$/gi,
  /\s+by\s+\w+$/gi,
  /\s+&\s+(suites?|rooms?|apartments?)$/gi,
];

/** Characters/patterns to normalize */
const NORMALIZATION_RULES = [
  [/[àáâãä]/g, 'a'],
  [/[èéêë]/g, 'e'],
  [/[ìíîï]/g, 'i'],
  [/[òóôõö]/g, 'o'],
  [/[ùúûü]/g, 'u'],
  [/[ý]/g, 'y'],
  [/[ñ]/g, 'n'],
  [/[ç]/g, 'c'],
  [/[ß]/g, 'ss'],
  [/[&]/g, 'and'],
  [/[-_]/g, ' '],
  [/\s+/g, ' '],
] as const;

/**
 * Normalize a hotel name for comparison.
 * Returns lowercase, diacritics removed, common words stripped.
 */
export function normalizeHotelName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove diacritics
  for (const [pattern, replacement] of NORMALIZATION_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Strip common suffixes
  for (const suffix of SUFFIXES_TO_STRIP) {
    normalized = normalized.replace(suffix, ' ');
  }

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/** Confidence score thresholds */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,     // Almost certain match
  MEDIUM: 0.70,   // Likely match — worth reviewing
  LOW: 0.50,      // Possible match — needs manual verification
  NONE: 0.00,     // No match
};

export interface ExistingHotelRecord {
  id: string;
  canonicalName: string;
  normalizedName: string;
  destinationId: string;
  stars: number;
}

/** ExistingHotelRecord augmented with pg_trgm similarity score from DB */
export interface SimilarHotelRecord extends ExistingHotelRecord {
  similarity: number;
}

/**
 * Find the best matching hotel from DB-sourced similarity candidates.
 * Applies an optional star-match boost on top of the pg_trgm similarity score.
 */
export function findBestHotelMatch(
  offer: RawOffer,
  candidates: SimilarHotelRecord[],
): HotelMatch {
  if (candidates.length === 0) {
    return { existingHotelId: null, confidenceScore: 0, isNewHotel: true };
  }

  let best: SimilarHotelRecord | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const starBoost = offer.hotelStars === candidate.stars ? 0.05 : 0;
    const score = Math.min(1, candidate.similarity + starBoost);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best && bestScore >= CONFIDENCE_THRESHOLDS.LOW) {
    return { existingHotelId: best.id, confidenceScore: bestScore, isNewHotel: false };
  }

  return { existingHotelId: null, confidenceScore: 0, isNewHotel: true };
}

/**
 * Generate a canonical hotel name from the offer.
 * Used when creating a new hotel record.
 */
export function generateCanonicalName(offer: RawOffer): string {
  // Remove provider-specific suffixes/prefixes
  let name = offer.hotelName.trim();

  // Remove star ratings from name
  name = name.replace(/\s*\d[\*★]\s*/g, ' ');
  name = name.replace(/\s*\d+\s*stars?\s*/gi, ' ');

  // Normalize whitespace
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/**
 * Normalize board type string to canonical BoardType
 */
export function normalizeBoardType(raw: string): BoardType {
  const lower = raw.toLowerCase().trim();

  const matchers: Array<[RegExp, BoardType]> = [
    [/ultra\s*all[\s-]*inclusive|uai|ultra all in/, 'ultra-all-inclusive'],
    [/all[\s-]*inclusive|all\s*in|ai\b/, 'all-inclusive'],
    [/half[\s-]*board|hb\b|połówka|śniadanie\s*\+\s*kolacja/, 'half-board'],
    [/full[\s-]*board|fb\b|pełne/, 'full-board'],
    [/bed\s*[&+and]+\s*breakfast|bb\b|śniadanie/, 'bed-and-breakfast'],
    [/room[\s-]*only|ro\b|bez wyżywienia|without meals/, 'room-only'],
  ];

  for (const [pattern, type] of matchers) {
    if (pattern.test(lower)) return type;
  }

  return 'unknown';
}
