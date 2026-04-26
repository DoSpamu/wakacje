'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import type { OfferRow } from '@/lib/types';
import { formatRating, stars, getScoreClass } from '@/lib/scoring';
import type { HotelReviewData, ReviewSnippet } from '@/app/api/hotels/reviews/route';

// ─── Review section keywords for client-side filtering ───────────────────────
const FILTER_KEYWORDS: Record<string, string[]> = {
  rooms: ['pokoj', 'pokoje', 'pokoju', 'lazienka', 'lazienki', 'lozko', 'balkon', 'widok', 'klimatyzacja', 'room', 'bathroom', 'bed', 'shower', 'prysznic'],
  food: ['jedzenie', 'jedzonko', 'wyzywienie', 'sniadanie', 'obiad', 'kolacja', 'restauracja', 'bufet', 'kuchnia', 'smak', 'food', 'breakfast', 'dinner', 'lunch', 'meal'],
};

function snippetMatchesFilter(snippet: ReviewSnippet, filter: string): boolean {
  if (filter === 'all') return true;
  const keywords = FILTER_KEYWORDS[filter] ?? [];
  const text = snippet.text.toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, max = 5 }: { label: string; value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 80 ? 'from-green-400 to-green-500' : pct >= 60 ? 'from-amber-400 to-yellow-400' : 'from-red-400 to-orange-400';
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── SourceBadge ──────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: string }) {
  if (source === 'tripadvisor') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">● TripAdvisor</span>;
  if (source === 'booking') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">● Booking.com</span>;
  return <span className="text-xs text-slate-400">{source}</span>;
}

// ─── HotelReviewsColumn ───────────────────────────────────────────────────────
function HotelReviewsColumn({ data, filter }: { data: HotelReviewData; filter: string }) {
  const hasSources = data.sources.length > 0;

  if (!hasSources) {
    return (
      <div className="p-4 text-center text-slate-400 text-xs">
        Brak danych o opiniach.<br />Uruchom enrichment dla tego hotelu.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {data.sources.map((src) => {
        const filteredSnippets = src.reviewSnippets.filter((s) => snippetMatchesFilter(s, filter));
        return (
          <div key={src.source}>
            <div className="flex items-center justify-between mb-3">
              <SourceBadge source={src.source} />
              {src.overallRating !== null && (
                <div className="text-right">
                  <span className="text-xl font-bold text-slate-800">{src.overallRating.toFixed(1)}</span>
                  <span className="text-xs text-slate-400 ml-1">/ 5</span>
                  {src.reviewCount && <div className="text-xs text-slate-400">{src.reviewCount.toLocaleString('pl-PL')} opinii</div>}
                </div>
              )}
            </div>

            {/* Category scores */}
            <div className="space-y-1.5 mb-3">
              <ScoreBar label="Jedzenie" value={src.foodScore} />
              <ScoreBar label="Pokoje" value={src.roomsScore} />
              <ScoreBar label="Czystosc" value={src.cleanlinessScore} />
              <ScoreBar label="Obsluga" value={src.serviceScore} />
            </div>

            {/* Summary labels */}
            {(src.foodSummary ?? src.roomsSummary) && (
              <div className="flex flex-col gap-0.5 mb-3">
                {src.foodSummary && <span className="text-xs text-slate-600">🍽 {src.foodSummary}</span>}
                {src.roomsSummary && <span className="text-xs text-slate-600">🛏 {src.roomsSummary}</span>}
              </div>
            )}

            {/* Review snippets */}
            {filteredSnippets.length > 0 ? (
              <div className="space-y-2">
                {filteredSnippets.slice(0, 4).map((s, i) => (
                  <blockquote key={i} className="rounded-lg bg-slate-50 px-3 py-2 border-l-2 border-blue-200">
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{s.text}</p>
                    {s.rating !== null && (
                      <div className="mt-1 text-xs text-slate-400 font-medium">{s.rating.toFixed(1)} / 10</div>
                    )}
                  </blockquote>
                ))}
              </div>
            ) : filter !== 'all' ? (
              <p className="text-xs text-slate-400 italic">Brak opinii pasujacych do filtru.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── CompareContent ───────────────────────────────────────────────────────────
function CompareContent() {
  const sp = useSearchParams();
  const ids = sp.get('ids')?.split(',').filter(Boolean) ?? [];

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, HotelReviewData>>({});
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'rooms' | 'food'>('all');

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }

    void (async () => {
      try {
        const res = await fetch(`/api/offers?ids=${ids.join(',')}&pageSize=10`);
        const json = await res.json() as { data: OfferRow[] };
        const loaded = (json.data ?? []).filter((o) => ids.includes(o.id));
        setOffers(loaded);

        // Fetch reviews for unique hotels
        const hotelIds = [...new Set(loaded.map((o) => o.hotel_id).filter(Boolean) as string[])];
        if (hotelIds.length > 0) {
          const rRes = await fetch(`/api/hotels/reviews?hotel_ids=${hotelIds.join(',')}`);
          const rJson = await rRes.json() as { hotels: Record<string, HotelReviewData> };
          setReviews(rJson.hotels ?? {});
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-center py-12 text-slate-400">Ladowanie...</div>;

  if (offers.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-4xl mb-3">&#9878;</div>
        <h3 className="font-semibold text-slate-700 mb-1">Brak ofert do porownania</h3>
        <p className="text-sm text-slate-500">Zaznacz oferty w tabeli wynikow i kliknij &quot;Porownaj&quot;.</p>
        <a href="/" className="btn-primary mt-4 text-sm inline-flex">Wrooc do wynikow</a>
      </div>
    );
  }

  const minPrice = Math.min(...offers.filter((o) => o.price_total > 0).map((o) => o.price_total));

  const rows: Array<{ label: string; render: (o: OfferRow) => React.ReactNode; highlight?: boolean }> = [
    { label: 'Hotel', render: (o) => <span className="font-semibold">{o.hotel_name}</span> },
    { label: 'Operator', render: (o) => o.provider_name },
    { label: 'Kraj', render: (o) => o.destination_display ?? '–' },
    { label: 'Lotnisko', render: (o) => o.departure_airport },
    { label: 'Wylot', render: (o) => o.departure_date },
    { label: 'Powrot', render: (o) => o.return_date },
    { label: 'Noce', render: (o) => o.nights },
    { label: 'Wyzywienie', render: (o) => o.board_type.replace('all-inclusive', 'All Inc.') },
    { label: 'Gwiazdki', render: (o) => <span className="stars">{stars(o.hotel_stars)}</span> },
    { label: 'Cena lacznie', highlight: true, render: (o) => <span className="font-bold">{o.price_total.toLocaleString('pl-PL')} zl</span> },
    { label: 'Cena / osoba', render: (o) => `${o.price_per_person.toLocaleString('pl-PL')} zl` },
    { label: 'TripAdvisor', render: (o) => o.tripadvisor_rating !== null ? `${formatRating(o.tripadvisor_rating)} / 5 (${o.tripadvisor_reviews?.toLocaleString('pl-PL')} opinii)` : '–' },
    { label: 'TA Jedzenie', render: (o) => o.tripadvisor_food_score !== null ? formatRating(o.tripadvisor_food_score) : '–' },
    { label: 'TA Pokoje', render: (o) => o.tripadvisor_rooms_score !== null ? formatRating(o.tripadvisor_rooms_score) : '–' },
    { label: 'Tagi', render: (o) => <div className="flex flex-wrap gap-1">{(o.tripadvisor_tags ?? []).slice(0, 4).map((t) => <span key={t} className="badge bg-slate-100 text-slate-600 text-xs">{t}</span>)}</div> },
    { label: 'Score', highlight: true, render: (o) => <span className={getScoreClass(o.composite_score)}>{o.composite_score ?? '–'}</span> },
    { label: 'Link', render: (o) => <a href={o.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs">Otworz oferte</a> },
  ];

  const FILTER_LABELS = { all: 'Wszystkie', rooms: 'O pokojach', food: 'O jedzeniu' } as const;

  return (
    <div className="space-y-8">
      {/* Price & details comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 w-40 min-w-[140px]">Cecha</th>
              {offers.map((o) => (
                <th key={o.id} className="text-left px-4 py-3 bg-blue-50 border-b border-slate-200 min-w-[200px]">
                  <div className="font-semibold text-slate-800 text-sm">{o.hotel_name}</div>
                  <div className="text-xs text-blue-600 font-normal">{o.provider_name}</div>
                  {o.price_total === minPrice && <span className="badge-green text-xs mt-1 inline-block">Najtansza</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, render, highlight }) => (
              <tr key={label} className={highlight ? 'bg-blue-50/30' : ''}>
                <td className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</td>
                {offers.map((o) => (
                  <td key={o.id} className="px-4 py-2.5 border-b border-slate-100 text-slate-700">{render(o)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reviews comparison section */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Opinie gosci</h2>
            <p className="text-sm text-slate-500">Porownanie recenzji z TripAdvisor i Booking.com</p>
          </div>
          {/* Category filter */}
          <div className="flex gap-2">
            {(Object.keys(FILTER_LABELS) as Array<keyof typeof FILTER_LABELS>).map((f) => (
              <button
                key={f}
                onClick={() => setReviewFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  reviewFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'rooms' ? 'Pokoje' : f === 'food' ? 'Jedzenie' : 'Wszystkie'}
              </button>
            ))}
          </div>
        </div>

        <div
          className="grid gap-4 border border-slate-200 rounded-xl overflow-hidden"
          style={{ gridTemplateColumns: `140px repeat(${offers.length}, minmax(220px, 1fr))` }}
        >
          {/* Header row */}
          <div className="bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center">Hotel</div>
          {offers.map((o) => (
            <div key={o.id} className="bg-blue-50 border-b border-slate-200 px-4 py-3">
              <div className="font-semibold text-sm text-slate-800">{o.hotel_name}</div>
              <div className="text-xs text-blue-600">{o.destination_display}</div>
            </div>
          ))}

          {/* Review data */}
          <div className="border-r border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-start pt-4">Opinie</div>
          {offers.map((o) => {
            const hotelReviews = o.hotel_id ? reviews[o.hotel_id] : null;
            return (
              <div key={o.id} className="border-l border-slate-100">
                {hotelReviews ? (
                  <HotelReviewsColumn data={hotelReviews} filter={reviewFilter} />
                ) : (
                  <div className="p-4 text-xs text-slate-400 text-center">Brak danych</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Porownanie ofert</h1>
        <p className="text-sm text-slate-500 mt-1">Ceny, szczegoly i opinie gosci side-by-side</p>
      </div>
      <div className="card overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-slate-400">Ladowanie...</div>}>
          <CompareContent />
        </Suspense>
      </div>
    </div>
  );
}
