import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export interface ReviewSnippet {
  text: string;
  rating: number | null;
}

export interface HotelReviewData {
  hotelId: string;
  hotelName: string;
  sources: {
    source: 'tripadvisor' | 'booking' | 'google';
    overallRating: number | null;
    reviewCount: number | null;
    foodScore: number | null;
    foodSummary: string | null;
    roomsScore: number | null;
    roomsSummary: string | null;
    cleanlinessScore: number | null;
    serviceScore: number | null;
    sentimentTags: string[];
    reviewSnippets: ReviewSnippet[];
    scrapedAt: string;
  }[];
}

/** GET /api/hotels/reviews?hotel_ids=id1,id2,id3 */
export async function GET(req: NextRequest) {
  const rawIds = req.nextUrl.searchParams.get('hotel_ids') ?? '';
  const hotelIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);

  if (hotelIds.length === 0) {
    return NextResponse.json({ hotels: {} });
  }

  const supabase = createServerClient();

  const [{ data: hotels }, { data: reviews }] = await Promise.all([
    supabase
      .from('hotels')
      .select('id, canonical_name')
      .in('id', hotelIds),
    supabase
      .from('hotel_reviews_summary')
      .select('hotel_id, source, overall_rating, review_count, food_score, food_summary, rooms_score, rooms_summary, cleanliness_score, service_score, sentiment_tags, review_snippets, scraped_at')
      .in('hotel_id', hotelIds),
  ]);

  const hotelNameMap = Object.fromEntries(
    (hotels ?? []).map((h) => [h.id, h.canonical_name as string]),
  );

  const result: Record<string, HotelReviewData> = {};

  for (const hotelId of hotelIds) {
    const hotelReviews = (reviews ?? []).filter((r) => r.hotel_id === hotelId);
    result[hotelId] = {
      hotelId,
      hotelName: hotelNameMap[hotelId] ?? 'Hotel',
      sources: hotelReviews.map((r) => ({
        source: r.source as HotelReviewData['sources'][0]['source'],
        overallRating: r.overall_rating,
        reviewCount: r.review_count,
        foodScore: r.food_score,
        foodSummary: r.food_summary,
        roomsScore: r.rooms_score,
        roomsSummary: r.rooms_summary,
        cleanlinessScore: r.cleanliness_score,
        serviceScore: r.service_score,
        sentimentTags: (r.sentiment_tags as string[]) ?? [],
        reviewSnippets: (r.review_snippets as ReviewSnippet[]) ?? [],
        scrapedAt: r.scraped_at,
      })),
    };
  }

  return NextResponse.json({ hotels: result });
}
