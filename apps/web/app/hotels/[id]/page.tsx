import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createServerClient } from '@/lib/supabase';
import { formatRating, stars, getScoreClass } from '@/lib/scoring';
import PriceHistoryChart, { type PricePoint } from '@/components/PriceHistoryChart';
import PriceAlertForm from '@/components/PriceAlertForm';
import BackButton from '@/components/BackButton';

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

  const destCanonical = (hotel.destinations as { canonical_name: string } | null)?.canonical_name ?? '';

  // Photos, offers, price history, and similar hotels fetched in parallel
  const [{ data: photosData }, { data: offers }, { data: priceRaw }, { data: similarRaw }] = await Promise.all([
    supabase
      .from('hotel_photos')
      .select('url, caption')
      .eq('hotel_id', params.id)
      .order('sort_order', { ascending: true })
      .limit(8),
    supabase
      .from('offers_enriched')
      .select('*')
      .eq('hotel_id', params.id)
      .eq('is_available', true)
      .order('price_total', { ascending: true })
      .limit(50),
    supabase
      .from('offers')
      .select('price_total, scraped_at')
      .eq('hotel_id', params.id)
      .order('scraped_at', { ascending: true })
      .limit(500),
    destCanonical
      ? supabase
          .from('offers_enriched')
          .select('hotel_id, hotel_canonical_name, hotel_stars, hotel_photo_url, price_total, tripadvisor_rating, composite_score')
          .eq('destination_canonical', destCanonical)
          .eq('is_available', true)
          .neq('hotel_id', params.id)
          .not('hotel_id', 'is', null)
          .order('composite_score', { ascending: false, nullsFirst: false })
          .limit(80)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  // Aggregate min price per calendar day
  const priceByDate = new Map<string, number>();
  for (const o of priceRaw ?? []) {
    const date = String(o.scraped_at).slice(0, 10);
    const current = priceByDate.get(date);
    if (!current || (o.price_total as number) < current) priceByDate.set(date, o.price_total as number);
  }
  const priceHistory: PricePoint[] = [...priceByDate.entries()].map(([date, price]) => ({ date, price }));

  // Price drop badge: compare last price to the price from ~7 days ago
  const lastPrice = priceHistory[priceHistory.length - 1]?.price ?? null;
  const oldPrice = priceHistory.length >= 3
    ? priceHistory[Math.max(0, priceHistory.length - 7)]?.price ?? null
    : null;
  const priceDrop = lastPrice && oldPrice && oldPrice - lastPrice > 200 ? oldPrice - lastPrice : null;

  // Cheapest current offer price for alert form default
  const cheapestOffer = (offers ?? []).reduce<number | null>((min, o) => {
    const p = (o as Record<string, number>)['price_total'];
    return min === null || p < min ? p : min;
  }, null);

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
    review_snippets: Array<{ text: string; rating: number | null }>;
    scraped_at: string;
  }>;

  const taReview = reviews.find((r) => r.source === 'tripadvisor');
  const bkReview = reviews.find((r) => r.source === 'booking');
  const gReview = reviews.find((r) => r.source === 'google');
  const dest = hotel.destinations as { canonical_name: string; display_name: string; country_code: string } | null;
  const h = hotel as Record<string, unknown>;
  const youtubeVideoId = h['youtube_video_id'] as string | null | undefined;
  const photos = photosData ?? [];

  // Deduplicate similar hotels by hotel_id, take top 6
  interface SimilarHotel { id: string; name: string; hotelStars: number; photoUrl: string | null; rating: number | null; score: number | null; minPrice: number }
  const similarMap = new Map<string, SimilarHotel>();
  for (const row of (similarRaw ?? []) as Record<string, unknown>[]) {
    const hid = String(row['hotel_id']);
    if (similarMap.has(hid)) {
      const ex = similarMap.get(hid)!;
      if ((row['price_total'] as number) < ex.minPrice) ex.minPrice = row['price_total'] as number;
    } else if (similarMap.size < 6) {
      similarMap.set(hid, {
        id: hid,
        name: (row['hotel_canonical_name'] as string) ?? hid,
        hotelStars: (row['hotel_stars'] as number) ?? 0,
        photoUrl: (row['hotel_photo_url'] as string | null) ?? null,
        rating: (row['tripadvisor_rating'] as number | null) ?? null,
        score: (row['composite_score'] as number | null) ?? null,
        minPrice: row['price_total'] as number,
      });
    }
  }
  const similarHotels = [...similarMap.values()];

  // Group offers by provider
  const offersByProvider = (offers ?? []).reduce<Record<string, typeof offers>>((acc, o) => {
    const key = (o as Record<string, string>)['provider_code'] ?? 'unknown';
    acc[key] = acc[key] ?? [];
    acc[key].push(o);
    return acc;
  }, {});

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Photo gallery */}
      {photos.length > 0 && (
        <div className="overflow-hidden rounded-xl">
          <div className="grid grid-cols-4 grid-rows-2 gap-1.5 h-72 md:h-96">
            {/* Main photo — spans 2 cols & 2 rows */}
            <a
              href={(photos[0] as Record<string, string>)['url']}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 row-span-2 relative overflow-hidden rounded-l-xl bg-slate-100"
            >
              <Image
                src={(photos[0] as Record<string, string>)['url']}
                alt={hotel.canonical_name}
                fill
                sizes="(max-width: 768px) 50vw, 40vw"
                className="object-cover hover:scale-105 transition-transform duration-500"
                priority
              />
            </a>
            {/* Side photos */}
            {photos.slice(1, 5).map((p, i) => {
              const photo = p as Record<string, string>;
              return (
                <a
                  key={i}
                  href={photo['url']}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative overflow-hidden bg-slate-100 ${i === 1 ? 'rounded-tr-xl' : ''} ${i === 3 ? 'rounded-br-xl' : ''}`}
                >
                  <Image
                    src={photo['url']}
                    alt={`${hotel.canonical_name} zdjęcie ${i + 2}`}
                    fill
                    sizes="(max-width: 768px) 25vw, 20vw"
                    className="object-cover hover:scale-105 transition-transform duration-500"
                  />
                </a>
              );
            })}
          </div>
          {photos.length > 5 && (
            <p className="text-xs text-slate-400 mt-1 text-right">+{photos.length - 5} więcej zdjęć</p>
          )}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <BackButton />
          <span>/</span>
          <span>{dest?.display_name}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{hotel.canonical_name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="stars text-lg">{stars(hotel.stars)}</span>
              <span className="text-sm text-slate-500">
                {hotel.location_city}{hotel.location_region ? `, ${hotel.location_region}` : ''}
                {dest && dest.display_name !== hotel.location_region && ` — ${dest.display_name}`}
              </span>
              {priceDrop && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  ↓ {priceDrop.toLocaleString('pl-PL')} zl taniej niz tydzien temu
                </span>
              )}
            </div>
          </div>

          {taReview && (
            <div className={getScoreClass(
              Math.round((taReview.overall_rating ?? 3) * 20)
            )}>
              {formatRating(taReview.overall_rating)} / 5
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      {(taReview || bkReview || gReview) && (
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

              {/* Review snippets */}
              {(taReview.review_snippets ?? []).length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Opinie gości</h3>
                  {taReview.review_snippets.map((s, i) => (
                    <blockquote key={i} className="rounded-lg bg-slate-50 px-3 py-2.5 border-l-2 border-green-300">
                      <p className="text-xs text-slate-700 leading-relaxed">{s.text}</p>
                      {s.rating !== null && (
                        <div className="mt-1 text-xs text-slate-400">
                          {'★'.repeat(Math.round(s.rating))}{'☆'.repeat(5 - Math.round(s.rating))}
                        </div>
                      )}
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          )}

          {bkReview && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <span className="text-blue-600">●</span> Booking.com
                <span className="text-xs text-slate-400 font-normal">(opinie po polsku)</span>
              </h2>

              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl font-bold text-slate-900">{formatRating(bkReview.overall_rating)}</span>
                <div>
                  <div className="stars">{stars(Math.round(bkReview.overall_rating ?? 0))}</div>
                  <div className="text-xs text-slate-400">{bkReview.review_count?.toLocaleString('pl-PL')} opinii</div>
                </div>
              </div>

              <div className="space-y-2">
                {[
                  { label: 'Jedzenie', value: bkReview.food_score, summary: bkReview.food_summary },
                  { label: 'Pokoje', value: bkReview.rooms_score, summary: bkReview.rooms_summary },
                  { label: 'Czystość', value: bkReview.cleanliness_score, summary: null },
                  { label: 'Obsługa', value: bkReview.service_score, summary: null },
                ].filter((r) => r.value !== null).map(({ label, value, summary }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{label}</span>
                      <span className="text-xs font-semibold">{formatRating(value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
                        style={{ width: `${((value ?? 0) / 5) * 100}%` }}
                      />
                    </div>
                    {summary && <p className="text-xs text-slate-500 mt-0.5">{summary}</p>}
                  </div>
                ))}
              </div>

              {bkReview.sentiment_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {bkReview.sentiment_tags.map((tag) => (
                    <span key={tag} className="badge bg-blue-50 text-blue-700 text-xs">{tag}</span>
                  ))}
                </div>
              )}

              {(bkReview.review_snippets ?? []).length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Co mówią Polacy</h3>
                  {bkReview.review_snippets.map((s, i) => (
                    <blockquote key={i} className="rounded-lg bg-blue-50 px-3 py-2.5 border-l-2 border-blue-300">
                      <p className="text-xs text-slate-700 leading-relaxed">{s.text}</p>
                      {s.rating !== null && (
                        <div className="mt-1 text-xs text-slate-400">
                          {'★'.repeat(Math.round(s.rating))}{'☆'.repeat(5 - Math.round(s.rating))}
                        </div>
                      )}
                    </blockquote>
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

      {/* YouTube promotional video */}
      {youtubeVideoId ? (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-700 mb-4">Film promocyjny</h2>
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-lg"
              src={`https://www.youtube.com/embed/${youtubeVideoId}?rel=0`}
              title={`${hotel.canonical_name} — film promocyjny`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(hotel.canonical_name + ' hotel')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.19a3.02 3.02 0 0 0-2.13-2.14C19.51 3.5 12 3.5 12 3.5s-7.51 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.49 20.5 12 20.5 12 20.5s7.51 0 9.38-.55a3.02 3.02 0 0 0 2.13-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/>
            </svg>
            Szukaj filmów na YouTube
          </a>
        </div>
      )}

      {/* Price history + alert form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {priceHistory.length >= 2 && (
          <div className="card p-5 md:col-span-2">
            <h2 className="font-semibold text-slate-700 mb-1">Historia cen</h2>
            <p className="text-xs text-slate-400 mb-4">Najtańsza oferta dla tego hotelu per dzień scrape&apos;owania</p>
            <PriceHistoryChart data={priceHistory} />
          </div>
        )}
        {cheapestOffer && (
          <PriceAlertForm
            hotelId={params.id}
            hotelName={hotel.canonical_name}
            currentPrice={cheapestOffer}
          />
        )}
      </div>

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

      {/* Similar hotels in the same destination */}
      {similarHotels.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Podobne hotele — {dest?.display_name}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {similarHotels.map((sh) => (
              <a
                key={sh.id}
                href={`/hotels/${sh.id}`}
                className="card overflow-hidden hover:shadow-md transition-shadow block"
              >
                <div className="h-28 bg-gradient-to-br from-blue-50 to-slate-200 relative flex items-center justify-center">
                  {sh.photoUrl ? (
                    <Image
                      src={sh.photoUrl}
                      alt={sh.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 17vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-3xl opacity-30">🏨</span>
                  )}
                  {sh.score !== null && (
                    <div className={`absolute top-1 right-1 ${getScoreClass(sh.score)} text-xs shadow-sm`}>
                      {sh.score}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="font-medium text-slate-800 text-xs leading-tight line-clamp-2">
                    {sh.name}
                  </div>
                  <div className="stars text-xs mt-0.5">{stars(sh.hotelStars)}</div>
                  {sh.rating !== null && (
                    <div className="text-xs text-amber-600 mt-0.5">
                      ★ {formatRating(sh.rating)}
                    </div>
                  )}
                  <div className="text-sm font-bold text-slate-900 mt-1">
                    od {sh.minPrice.toLocaleString('pl-PL')} zł
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
