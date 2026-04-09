import type { AirportCode, BoardType, ProviderCode } from './offer.js';
import type { HotelStars } from './hotel.js';

/** Canonical search filter — provider-agnostic */
export interface SearchFilter {
  destinations: CanonicalDestination[];
  departureAirports: AirportCode[];
  departureDateFrom: string;   // YYYY-MM-DD
  departureDateTo: string;     // YYYY-MM-DD
  nights: NightsRange;
  adults: number;
  children: number;
  hotelStars: HotelStars[];
  boardTypes: BoardType[];
  priceMin?: number;
  priceMax?: number;
  currency: string;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  providers?: ProviderCode[];  // if empty, use all active providers
}

export type CanonicalDestination =
  | 'turkey'
  | 'egypt'
  | 'greece'
  | 'spain'
  | 'cyprus'
  | 'tunisia'
  | 'bulgaria'
  | 'croatia'
  | 'malta'
  | 'canary-islands'
  | 'portugal'
  | 'morocco'
  | 'albania'
  | 'montenegro';

export interface NightsRange {
  min: number;
  max: number;
}

export type SortField =
  | 'price'
  | 'compositeScore'
  | 'hotelStars'
  | 'foodScore'
  | 'overallRating'
  | 'departureDate'
  | 'nights';

/** Provider-specific translated filter — after filterTranslator runs */
export interface ProviderFilter {
  providerCode: ProviderCode;
  searchUrl?: string;
  params: Record<string, string | string[] | number | number[]>;
}

/** Default filter preset for "quick start" */
export const DEFAULT_FILTER: SearchFilter = {
  destinations: ['turkey', 'egypt', 'greece', 'spain', 'cyprus'],
  departureAirports: ['KTW', 'KRK'],
  departureDateFrom: new Date().toISOString().split('T')[0]!,
  departureDateTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
  nights: { min: 7, max: 14 },
  adults: 2,
  children: 0,
  hotelStars: [4, 5],
  boardTypes: ['all-inclusive', 'ultra-all-inclusive'],
  currency: 'PLN',
  sortBy: 'compositeScore',
  sortOrder: 'desc',
};
