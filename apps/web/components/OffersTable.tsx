'use client';

import Link from 'next/link';
import type { OfferRow } from '@/lib/types';
import { getScoreClass, formatRating, stars } from '@/lib/scoring';

interface Props {
  offers: OfferRow[];
  loading: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}

function SortIcon({ column, current, order }: { column: string; current: string; order: string }) {
  if (column !== current) return <span className="text-slate-300 ml-1">↕</span>;
  return <span className="text-blue-500 ml-1">{order === 'asc' ? '↑' : '↓'}</span>;
}

const BOARD_LABELS: Record<string, string> = {
  'all-inclusive': 'All Inc.',
  'ultra-all-inclusive': 'Ultra AI',
  'half-board': 'HB',
  'full-board': 'FB',
  'bed-and-breakfast': 'BB',
  'room-only': 'RO',
  'unknown': '–',
};

const PROVIDER_COLORS: Record<string, string> = {
  rpl: 'badge-blue',
  exim: 'badge-green',
  coral: 'badge-amber',
  itaka: 'bg-purple-100 text-purple-700 badge',
  grecos: 'bg-sky-100 text-sky-700 badge',
  tui: 'bg-rose-100 text-rose-700 badge',
};

export default function OffersTable({
  offers,
  loading,
  sortBy,
  sortOrder,
  onSort,
  selected,
  onSelectedChange,
}: Props) {
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 5) next.add(id);
    onSelectedChange(next);
  };

  const toggleAll = () => {
    if (selected.size === offers.length) {
      onSelectedChange(new Set());
    } else {
      onSelectedChange(new Set(offers.slice(0, 5).map((o) => o.id)));
    }
  };

  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-100">
              <div className="h-4 w-4 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (offers.length === 0) return null;

  const th = (label: string, column: string) => (
    <th
      className="sortable"
      onClick={() => onSort(column)}
    >
      {label}
      <SortIcon column={column} current={sortBy} order={sortOrder} />
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="offers-table">
        <thead>
          <tr>
            <th className="w-8">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === offers.length}
                onChange={toggleAll}
                className="h-3.5 w-3.5"
              />
            </th>
            {th('Hotel', 'hotel_name')}
            <th>Kraj / Lotnisko</th>
            <th>Operator</th>
            {th('Wylot', 'departure_date')}
            {th('Noce', 'nights')}
            <th>Wyżywienie</th>
            {th('★', 'hotel_stars')}
            {th('Cena łącznie', 'price_total')}
            {th('Cena/os.', 'price_per_person')}
            {th('TripAdv.', 'tripadvisor_rating')}
            {th('TA Jedzenie', 'tripadvisor_food_score')}
            <th>Tagi</th>
            {th('Score', 'composite_score')}
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id} className={selected.has(offer.id) ? 'bg-blue-50' : ''}>
              {/* Select */}
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={selected.has(offer.id)}
                  onChange={() => toggleSelect(offer.id)}
                  className="h-3.5 w-3.5"
                />
              </td>

              {/* Hotel name */}
              <td className="min-w-[180px]">
                <div className="font-medium text-slate-900">
                  {offer.hotel_id ? (
                    <Link
                      href={`/hotels/${offer.hotel_id}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {offer.hotel_name}
                    </Link>
                  ) : (
                    offer.hotel_name
                  )}
                </div>
                {offer.hotel_location && (
                  <div className="text-xs text-slate-400 mt-0.5">{offer.hotel_location}</div>
                )}
              </td>

              {/* Country / Airport */}
              <td className="whitespace-nowrap">
                <div className="text-sm">{offer.destination_display ?? offer.country_code ?? '–'}</div>
                <div className="text-xs text-slate-400">{offer.departure_airport}</div>
              </td>

              {/* Provider */}
              <td>
                <span className={PROVIDER_COLORS[offer.provider_code] ?? 'badge bg-slate-100 text-slate-600'}>
                  {offer.provider_name}
                </span>
              </td>

              {/* Departure date */}
              <td className="whitespace-nowrap text-sm">
                {offer.departure_date}
              </td>

              {/* Nights */}
              <td className="text-center text-sm font-medium">{offer.nights}</td>

              {/* Board type */}
              <td>
                <span className="badge bg-teal-50 text-teal-700 text-xs">
                  {BOARD_LABELS[offer.board_type] ?? offer.board_type}
                </span>
              </td>

              {/* Stars */}
              <td className="text-sm whitespace-nowrap">
                <span className="stars">{stars(offer.hotel_stars)}</span>
              </td>

              {/* Price total */}
              <td className="text-right font-semibold text-slate-900 whitespace-nowrap">
                {offer.price_total.toLocaleString('pl-PL')} zł
              </td>

              {/* Price per person */}
              <td className="text-right text-sm text-slate-600 whitespace-nowrap">
                {offer.price_per_person.toLocaleString('pl-PL')} zł
              </td>

              {/* TripAdvisor rating */}
              <td className="text-center">
                {offer.tripadvisor_rating !== null ? (
                  <div className="inline-flex items-center gap-1 text-sm">
                    <span className="text-amber-500">★</span>
                    <span className="font-medium">{formatRating(offer.tripadvisor_rating)}</span>
                    {offer.tripadvisor_reviews && (
                      <span className="text-slate-400 text-xs">({offer.tripadvisor_reviews.toLocaleString('pl-PL')})</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-300 text-xs">–</span>
                )}
              </td>

              {/* Food score */}
              <td className="text-center">
                {offer.tripadvisor_food_score !== null ? (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    (offer.tripadvisor_food_score ?? 0) >= 4.5
                      ? 'bg-green-100 text-green-700'
                      : (offer.tripadvisor_food_score ?? 0) >= 4.0
                      ? 'bg-lime-100 text-lime-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {formatRating(offer.tripadvisor_food_score)}
                  </span>
                ) : (
                  <span className="text-slate-300 text-xs">–</span>
                )}
              </td>

              {/* Tags */}
              <td className="max-w-[200px]">
                <div className="flex flex-wrap gap-1">
                  {(offer.tripadvisor_tags ?? []).slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 truncate max-w-[120px]"
                      title={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </td>

              {/* Composite score */}
              <td className="text-center">
                {offer.composite_score !== null ? (
                  <span className={getScoreClass(offer.composite_score)}>
                    {offer.composite_score}
                  </span>
                ) : (
                  <span className="text-slate-300 text-xs">–</span>
                )}
              </td>

              {/* Source link */}
              <td>
                <a
                  href={offer.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-xs underline whitespace-nowrap"
                >
                  Otwórz ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
