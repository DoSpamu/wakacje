/** Canonical hotel type shared across all providers */
export interface Hotel {
  id: string;
  canonicalName: string;
  normalizedName: string;
  destinationId: string;
  stars: HotelStars;
  locationCity?: string;
  locationRegion?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export type HotelStars = 3 | 4 | 5;

export interface HotelAlias {
  id: string;
  hotelId: string;
  providerId: string;
  providerHotelName: string;
  providerHotelId?: string;
  confidenceScore: number; // 0.00–1.00
  verified: boolean;
  createdAt: string;
}

export interface HotelReviewSummary {
  id: string;
  hotelId: string;
  source: ReviewSource;
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
  scrapedAt: string;
  createdAt: string;
}

export type ReviewSource = 'tripadvisor' | 'google';

export interface HotelWithReviews extends Hotel {
  reviews: HotelReviewSummary[];
  aliases: HotelAlias[];
}
