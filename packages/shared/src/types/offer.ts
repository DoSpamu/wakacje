import type { HotelStars } from './hotel.js';

/** A normalized vacation offer from any provider */
export interface Offer {
  id: string;
  searchRunId: string;
  providerId: string;
  providerCode: ProviderCode;
  hotelId?: string;

  /** Provider's raw offer identifier */
  providerOfferId?: string;
  destinationId?: string;

  // Flight details
  departureAirport: AirportCode;
  departureDate: string; // ISO date YYYY-MM-DD
  returnDate: string;    // ISO date YYYY-MM-DD
  nights: number;

  // Hotel details
  hotelName: string;
  hotelStars: HotelStars;
  hotelLocation: string;
  boardType: BoardType;
  roomType?: string;

  // Pricing
  priceTotal: number;
  pricePerPerson: number;
  currency: string;
  adults: number;
  children: number;

  // Source
  sourceUrl: string;
  rawData?: Record<string, unknown>;

  // Scoring
  compositeScore?: number;

  isAvailable: boolean;
  scrapedAt: string;
  expiresAt?: string;
  createdAt: string;
}

export type ProviderCode = 'rpl' | 'exim' | 'itaka' | 'grecos' | 'tui' | 'wakacjepl';

export type AirportCode = 'KTW' | 'KRK' | 'WAW' | 'GDN' | 'POZ' | 'WRO' | 'RZE';

export type BoardType =
  | 'all-inclusive'
  | 'ultra-all-inclusive'
  | 'half-board'
  | 'full-board'
  | 'bed-and-breakfast'
  | 'room-only'
  | 'unknown';

export interface OfferWithHotel extends Offer {
  hotel?: {
    id: string;
    canonicalName: string;
    stars: HotelStars;
    tripadvisorRating?: number;
    tripadvisorReviews?: number;
    googleRating?: number;
    googleReviews?: number;
    foodScore?: number;
    foodSummary?: string;
    roomsScore?: number;
    roomsSummary?: string;
    sentimentTags?: string[];
  };
}

export interface SearchRun {
  id: string;
  providerId: string;
  providerCode: ProviderCode;
  searchParams: SearchParams;
  status: SearchRunStatus;
  startedAt?: string;
  completedAt?: string;
  offersFound: number;
  errorMessage?: string;
  createdAt: string;
}

export type SearchRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export interface SearchParams {
  destinations: string[];         // canonical destination keys
  departureAirports: AirportCode[];
  departureDateFrom: string;      // YYYY-MM-DD
  departureDateTo: string;        // YYYY-MM-DD
  nights: number[];               // e.g. [7, 8, 9]
  adults: number;
  children?: number;
  hotelStars: HotelStars[];
  boardTypes: BoardType[];
  priceMin?: number;
  priceMax?: number;
  currency?: string;
}
