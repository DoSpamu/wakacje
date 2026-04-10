/** Enriched offer row — returned by the /api/offers endpoint */
export interface OfferRow {
  id: string;
  search_run_id: string;
  provider_id: string;
  hotel_id: string | null;
  destination_id: string | null;
  departure_airport: string;
  departure_date: string;
  return_date: string;
  nights: number;
  hotel_name: string;
  hotel_stars: number;
  hotel_location: string;
  board_type: string;
  room_type: string | null;
  price_total: number;
  price_per_person: number;
  currency: string;
  adults: number;
  children: number;
  source_url: string;
  composite_score: number | null;
  is_available: boolean;
  scraped_at: string;
  // Joined fields
  provider_code: string;
  provider_name: string;
  destination_canonical: string | null;
  destination_display: string | null;
  country_code: string | null;
  hotel_canonical_name: string | null;
  hotel_photo_url: string | null;
  hotel_youtube_id: string | null;
  tripadvisor_rating: number | null;
  tripadvisor_reviews: number | null;
  tripadvisor_food_score: number | null;
  tripadvisor_food_summary: string | null;
  tripadvisor_rooms_score: number | null;
  tripadvisor_rooms_summary: string | null;
  tripadvisor_cleanliness: number | null;
  tripadvisor_service: number | null;
  tripadvisor_tags: string[] | null;
  google_rating: number | null;
  google_reviews: number | null;
  google_food_score: number | null;
}

/** Filters applied from the UI */
export interface UIFilter {
  destinations: string[];
  airports: string[];
  dateFrom: string;
  dateTo: string;
  nightsMin: number;
  nightsMax: number;
  adults: number;
  stars: number[];
  boardTypes: string[];
  priceMax?: number;
  providers?: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface ScrapeRunRow {
  id: string;
  provider_code: string;
  provider_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  offers_found: number;
  error_message: string | null;
  created_at: string;
  duration_seconds: number | null;
}
