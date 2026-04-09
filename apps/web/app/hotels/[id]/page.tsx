import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { formatRating, stars, getScoreClass } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function HotelPage({ params }: Props) {
  const supabase = createServerClient();

  // Hotel details
  const { data: hotel } = await supabase
    .from('hotels')
    .select(`
      *,
      destinations (canonical_name, display_name, country_code),
      hotel_reviews_summary (*)
    `)
    .eq('id', params.id)
    .single();

  if (!hotel) notFound();

  // All offers for this hotel
  const { data: offers } = await supabase
    .from('offers_enriched')
    .select('*')
    .eq('hotel_id', params.id)
    .eq('is_available', true)
    .order('price_total', { ascending: true })
    .limit(50);

  const reviews = (hotel.hotel_reviews_summary ?? []) as Array<{
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
  }>;

  const taReview = reviews.find((r) => r.source === 'tripadvisor');
  const gReview = reviews.find((r) => r.source === 'google');

  const dest = hotel.destinations as { canonical_name: string; display_name: string; country_code: string } | null;

  // Group offers by provider
  const offersByProvider = (offers ?? []).reduce<Record<string, typeof offers>>((acc, o) => {
    const key = (o as Record<string, string>)['provider_code'] ?? 'unknown';
    acc[key] = acc[key] ?? [];
    acc[key].push(o);
    return acc;
  }, {});

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <a href="/" className="hover:underline">Szukaj</a>
          <span>/</span>
          <span>{dest?.display_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{hotel.canonical_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="stars text-lg">{stars(hotel.stars)}</span>
              <span className="text-sm text-slate-500">
                {hotel.location_city}{hotel.location_region ? `, ${hotel.location_region}` : ''}
                {dest && ` — ${dest.display_name}`}
              </span>
            </div>
          </div>

          {taReview && (
            <div className={`score-pill text-base ${getScoreClass(
              Math.round((taReview.overall_rating ?? 3) * 20)
            )}`}>
              {formatRating(taReview.overall_rating)} / 5
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      {(taReview || gReview) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {taReview && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <span className="text-green-600">●</span> TripAdvisor
              </h2>

              {/* Overall */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl font-bold text-slate-900">{formatRating(taReview.overall_rating)}</span>
                <div>
                  <div className="stars">{stars(Math.round(taReview.overall_rating ?? 0))}</div>
                  <div className="text-xs text-slate-400">{taReview.review_count?.toLocaleString('pl-PL')} opinii</div>
                </div>
              </div>

              {/* Category scores */}
              <div className="space-y-2">
                {[
                  { label: 'Jedzenie', value: taReview.food_score, summary: taReview.food_summary },
                  { label: 'Pokoje', value: taReview.rooms_score, summary: taReview.rooms_summary },
                  { label: 'Czystość', value: taReview.cleanliness_score, summary: null },
                  { label: 'Obsługa', value: taReview.service_score, summary: null },
                  { label: 'Plaża', value: taReview.beach_score, summary: null },
                ].filter((r) => r.value !== null).map(({ label, value, summary }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{label}</span>
                      <span className="text-xs font-semibold">{formatRating(value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-500"
                        style={{ width: `${((value ?? 0) / 5) * 100}%` }}
                      />
                    </div>
                    {summary && <p className="text-xs text-slate-500 mt-0.5">{summary}</p>}
                  </div>
                ))}
              </div>

              {/* Tags */}
              {taReview.sentiment_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {taReview.sentiment_tags.map((tag) => (
                    <span key={tag} className="badge bg-slate-100 text-slate-600 text-xs">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {gReview && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <span className="text-blue-600">●</span> Google Reviews
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-slate-900">{formatRating(gReview.overall_rating)}</span>
                <div>
                  <div className="stars">{stars(Math.round(gReview.overall_rating ?? 0))}</div>
                  <div className="text-xs text-slate-400">{gReview.review_count?.toLocaleString('pl-PL')} opinii</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offers grouped by provider */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Dostępne oferty</h2>

        {Object.keys(offersByProvider).length === 0 ? (
          <div className="card p-8 text-center text-slate-500 text-sm">
            Brak dostępnych ofert dla tego hotelu.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(offersByProvider).map(([providerCode, provOffers]) => (
              <div key={providerCode} className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 font-medium text-sm text-slate-700">
                  {(provOffers?.[0] as Record<string, string> | undefined)?.['provider_name'] ?? providerCode}
                </div>
                <div className="divide-y divide-slate-100">
                  {(provOffers ?? []).slice(0, 10).map((offer) => {
                    const o = offer as Record<string, unknown>;
                    return (
                      <div key={String(o['id'])} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 flex-wrap gap-3">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-slate-600 whitespace-nowrap">{String(o['departure_date'])}</span>
                          <span className="text-slate-400">{String(o['nights'])} nocy</span>
                          <span className="text-slate-400">{String(o['departure_airport'])}</span>
                          <span className="badge bg-teal-50 text-teal-700 text-xs">
                            {String(o['board_type']).replace('all-inclusive', 'All Inc.')}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold text-slate-900">
                              {Number(o['price_total']).toLocaleString('pl-PL')} zł
                            </div>
                            <div className="text-xs text-slate-400">
                              {Number(o['price_per_person']).toLocaleString('pl-PL')} zł/os.
                            </div>
                          </div>
                          <a
                            href={String(o['source_url'])}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary text-xs"
                          >
                            Rezerwuj ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
