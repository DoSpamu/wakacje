import { createClient } from '@supabase/supabase-js';

if (!process.env['SUPABASE_URL']) throw new Error('SUPABASE_URL is required');
if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

export const supabase = createClient(
  process.env['SUPABASE_URL'],
  process.env['SUPABASE_SERVICE_ROLE_KEY'],
  {
    auth: { persistSession: false },
  },
);

export type Database = {
  public: {
    Tables: {
      providers: {
        Row: {
          id: string;
          code: string;
          name: string;
          base_url: string;
          is_active: boolean;
          created_at: string;
        };
      };
      destinations: {
        Row: {
          id: string;
          canonical_name: string;
          display_name: string;
          country_code: string | null;
          created_at: string;
        };
      };
      hotels: {
        Row: {
          id: string;
          canonical_name: string;
          normalized_name: string;
          destination_id: string | null;
          stars: number;
          location_city: string | null;
          location_region: string | null;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
          updated_at: string;
        };
      };
      hotel_aliases: {
        Row: {
          id: string;
          hotel_id: string;
          provider_id: string;
          provider_hotel_name: string;
          provider_hotel_id: string | null;
          confidence_score: number;
          verified: boolean;
          created_at: string;
        };
      };
      search_runs: {
        Row: {
          id: string;
          provider_id: string;
          search_params: Record<string, unknown>;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          offers_found: number;
          error_message: string | null;
          created_at: string;
        };
      };
      offers: {
        Row: {
          id: string;
          search_run_id: string;
          provider_id: string;
          hotel_id: string | null;
          provider_offer_id: string | null;
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
          raw_data: Record<string, unknown> | null;
          composite_score: number | null;
          is_available: boolean;
          scraped_at: string;
          expires_at: string | null;
          created_at: string;
        };
      };
      hotel_reviews_summary: {
        Row: {
          id: string;
          hotel_id: string;
          source: string;
          overall_rating: number | null;
          review_count: number | null;
          food_score: number | null;
          food_summary: string | null;
          rooms_score: number | null;
          rooms_summary: string | null;
          cleanliness_score: number | null;
          service_score: number | null;
          beach_score: number | null;
          sentiment_tags: string[];
          scraped_at: string;
          created_at: string;
        };
      };
      scrape_logs: {
        Row: {
          id: string;
          search_run_id: string | null;
          provider_id: string | null;
          level: string;
          message: string;
          details: Record<string, unknown> | null;
          created_at: string;
        };
      };
    };
  };
};
