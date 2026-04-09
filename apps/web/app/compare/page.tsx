'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import type { OfferRow } from '@/lib/types';
import { formatRating, stars, getScoreClass } from '@/lib/scoring';

function CompareContent() {
  const sp = useSearchParams();
  const ids = sp.get('ids')?.split(',').filter(Boolean) ?? [];

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }

    void (async () => {
      try {
        const res = await fetch(`/api/offers?ids=${ids.join(',')}&pageSize=10`);
        const json = await res.json() as { data: OfferRow[] };
        // Filter only the requested IDs
        setOffers((json.data ?? []).filter((o) => ids.includes(o.id)));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-center py-12 text-slate-400">Ładowanie...</div>;

  if (offers.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-4xl mb-3">⚖️</div>
        <h3 className="font-semibold text-slate-700 mb-1">Brak ofert do porównania</h3>
        <p className="text-sm text-slate-500">Zaznacz oferty w tabeli wyników i kliknij &quot;Porównaj&quot;.</p>
        <a href="/" className="btn-primary mt-4 text-sm inline-flex">Wróć do wyników</a>
      </div>
    );
  }

  const rows: Array<{
    label: string;
    render: (o: OfferRow) => React.ReactNode;
    highlight?: boolean;
  }> = [
    { label: 'Hotel', render: (o) => <span className="font-semibold">{o.hotel_name}</span> },
    { label: 'Operator', render: (o) => o.provider_name },
    { label: 'Kraj', render: (o) => o.destination_display ?? '–' },
    { label: 'Lotnisko', render: (o) => o.departure_airport },
    { label: 'Wylot', render: (o) => o.departure_date },
    { label: 'Powrót', render: (o) => o.return_date },
    { label: 'Noce', render: (o) => o.nights },
    { label: 'Wyżywienie', render: (o) => o.board_type.replace('all-inclusive', 'All Inc.') },
    { label: 'Gwiazdki', render: (o) => <span className="stars">{stars(o.hotel_stars)}</span> },
    {
      label: 'Cena łącznie',
      highlight: true,
      render: (o) => <span className="font-bold">{o.price_total.toLocaleString('pl-PL')} zł</span>,
    },
    {
      label: 'Cena / osoba',
      render: (o) => `${o.price_per_person.toLocaleString('pl-PL')} zł`,
    },
    {
      label: 'TripAdvisor',
      render: (o) => o.tripadvisor_rating !== null
        ? `★ ${formatRating(o.tripadvisor_rating)} (${o.tripadvisor_reviews?.toLocaleString('pl-PL')} opinii)`
        : '–',
    },
    {
      label: 'TA Jedzenie',
      render: (o) => o.tripadvisor_food_score !== null ? formatRating(o.tripadvisor_food_score) : '–',
    },
    {
      label: 'TA Pokoje',
      render: (o) => o.tripadvisor_rooms_score !== null ? formatRating(o.tripadvisor_rooms_score) : '–',
    },
    {
      label: 'Opis jedzenia',
      render: (o) => <span className="text-xs">{o.tripadvisor_food_summary ?? '–'}</span>,
    },
    {
      label: 'Tagi',
      render: (o) => (
        <div className="flex flex-wrap gap-1">
          {(o.tripadvisor_tags ?? []).slice(0, 4).map((t) => (
            <span key={t} className="badge bg-slate-100 text-slate-600 text-xs">{t}</span>
          ))}
        </div>
      ),
    },
    {
      label: 'Score',
      highlight: true,
      render: (o) => (
        <span className={getScoreClass(o.composite_score)}>
          {o.composite_score ?? '–'}
        </span>
      ),
    },
    {
      label: 'Link',
      render: (o) => (
        <a href={o.source_url} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 underline text-xs">
          Otwórz ofertę ↗
        </a>
      ),
    },
  ];

  const minPrice = Math.min(...offers.filter((o) => o.price_total > 0).map((o) => o.price_total));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500 w-40 min-w-[140px]">
              Cecha
            </th>
            {offers.map((o) => (
              <th key={o.id} className="text-left px-4 py-3 bg-blue-50 border-b border-slate-200 min-w-[200px]">
                <div className="font-semibold text-slate-800 text-sm">{o.hotel_name}</div>
                <div className="text-xs text-blue-600 font-normal">{o.provider_name}</div>
                {o.price_total === minPrice && (
                  <span className="badge-green text-xs mt-1 inline-block">Najtańsza</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, render, highlight }) => (
            <tr key={label} className={highlight ? 'bg-blue-50/30' : ''}>
              <td className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {label}
              </td>
              {offers.map((o) => (
                <td key={o.id} className="px-4 py-2.5 border-b border-slate-100 text-slate-700">
                  {render(o)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Porównanie ofert</h1>
        <p className="text-sm text-slate-500 mt-1">
          Szczegółowe porównanie wybranych ofert
        </p>
      </div>

      <div className="card overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-slate-400">Ładowanie...</div>}>
          <CompareContent />
        </Suspense>
      </div>
    </div>
  );
}
