'use client';

import { useState, useCallback, Fragment } from 'react';
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
  trends?: Record<string, number>;
}

interface ReviewSnippet {
  text: string;
  rating: number | null;
}

interface ReviewSource {
  source: string;
  overallRating: number | null;
  reviewSnippets: ReviewSnippet[];
  sentimentTags: string[];
  foodScore: number | null;
  roomsScore: number | null;
}

interface HotelGroup {
  key: string;
  hotelId: string | null;
  hotelName: string;
  hotelStars: number;
  hotelLocation: string;
  hotelPhotoUrl: string | null;
  destDisplay: string | null;
  taRating: number | null;
  taFoodScore: number | null;
  taReviews: number | null;
  taTags: string[] | null;
  compositeScore: number | null;
  nightsMin: number;
  nightsMax: number;
  cheapest: OfferRow;
  providers: Array<{ code: string; name: string; price: number; offerId: string }>;
  offers: OfferRow[];
}

function groupOffers(offers: OfferRow[]): HotelGroup[] {
  const map = new Map<string, HotelGroup>();

  for (const offer of offers) {
    const key = offer.hotel_id ?? offer.hotel_name;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        hotelId: offer.hotel_id,
        hotelName: offer.hotel_name,
        hotelStars: offer.hotel_stars,
        hotelLocation: offer.hotel_location,
        hotelPhotoUrl: offer.hotel_photo_url,
        destDisplay: offer.destination_display ?? offer.country_code ?? null,
        taRating: offer.tripadvisor_rating,
        taFoodScore: offer.tripadvisor_food_score,
        taReviews: offer.tripadvisor_reviews,
        taTags: offer.tripadvisor_tags,
        compositeScore: offer.composite_score,
        nightsMin: offer.nights,
        nightsMax: offer.nights,
        cheapest: offer,
        providers: [{ code: offer.provider_code, name: offer.provider_name, price: offer.price_total, offerId: offer.id }],
        offers: [offer],
      });
    } else {
      existing.offers.push(offer);
      existing.nightsMin = Math.min(existing.nightsMin, offer.nights);
      existing.nightsMax = Math.max(existing.nightsMax, offer.nights);
      if (offer.price_total < existing.cheapest.price_total) {
        existing.cheapest = offer;
      }
      // Add provider if not already present
      if (!existing.providers.some((p) => p.code === offer.provider_code)) {
        existing.providers.push({ code: offer.provider_code, name: offer.provider_name, price: offer.price_total, offerId: offer.id });
      } else {
        // Update price if this provider has a cheaper offer
        const prov = existing.providers.find((p) => p.code === offer.provider_code)!;
        if (offer.price_total < prov.price) {
          prov.price = offer.price_total;
          prov.offerId = offer.id;
        }
      }
    }
  }

  return [...map.values()];
}

function SortIcon({ column, current, order }: { column: string; current: string; order: string }) {
  if (column !== current) return <span className="text-slate-300 ml-1">&#x21C5;</span>;
  return <span className="text-blue-500 ml-1">{order === 'asc' ? '↑' : '↓'}</span>;
}

const BOARD_LABELS: Record<string, string> = {
  'all-inclusive': 'All Inc.',
  'ultra-all-inclusive': 'Ultra AI',
  'half-board': 'HB',
  'full-board': 'FB',
  'bed-and-breakfast': 'BB',
  'room-only': 'RO',
  'unknown': '-',
};

const PROVIDER_COLORS: Record<string, string> = {
  rpl: 'badge-blue',
  exim: 'badge-green',
  coral: 'badge-amber',
  itaka: 'bg-purple-100 text-purple-700 badge',
  grecos: 'bg-sky-100 text-sky-700 badge',
  tui: 'bg-rose-100 text-rose-700 badge',
  wakacjepl: 'bg-orange-100 text-orange-700 badge',
};

const COL_COUNT_FLAT = 15;
const COL_COUNT_GROUP = 13;

export default function OffersTable({
  offers,
  loading,
  sortBy,
  sortOrder,
  onSort,
  selected,
  onSelectedChange,
  trends,
}: Props) {
  const [viewMode, setViewMode] = useState<'grouped' | 'cards' | 'flat' | 'list'>('list');
  const [groupSort, setGroupSort] = useState<'default' | 'price_per_night' | 'rating'>('default');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [expandedHotels, setExpandedHotels] = useState<Set<string>>(new Set());
  const [reviewsCache, setReviewsCache] = useState<Map<string, ReviewSource[]>>(new Map());
  const [loadingReviews, setLoadingReviews] = useState<Set<string>>(new Set());

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

  const toggleGroupExpand = (key: string) => {
    const next = new Set(expandedKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedKeys(next);
  };

  const toggleReviews = useCallback(
    async (hotelId: string) => {
      const next = new Set(expandedHotels);
      if (next.has(hotelId)) {
        next.delete(hotelId);
        setExpandedHotels(next);
        return;
      }
      next.add(hotelId);
      setExpandedHotels(next);

      if (!reviewsCache.has(hotelId) && !loadingReviews.has(hotelId)) {
        setLoadingReviews((prev) => new Set([...prev, hotelId]));
        try {
          const res = await fetch(`/api/hotels/reviews?hotel_ids=${hotelId}`);
          if (res.ok) {
            const data = (await res.json()) as { hotels: Record<string, { sources: ReviewSource[] }> };
            const hotelData = data?.hotels?.[hotelId];
            if (hotelData) {
              setReviewsCache((prev) => new Map([...prev, [hotelId, hotelData.sources]]));
            }
          }
        } finally {
          setLoadingReviews((prev) => { const n = new Set(prev); n.delete(hotelId); return n; });
        }
      }
    },
    [expandedHotels, reviewsCache, loadingReviews],
  );

  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-100">
              <div className="h-4 w-4 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (offers.length === 0) return null;

  const th = (label: string, column: string) => (
    <th className="sortable" onClick={() => onSort(column)}>
      {label}
      <SortIcon column={column} current={sortBy} order={sortOrder} />
    </th>
  );

  const rawGroups = viewMode !== 'flat' ? groupOffers(offers) : [];
  const groups = groupSort === 'price_per_night'
    ? [...rawGroups].sort((a, b) => (a.cheapest.price_total / a.cheapest.nights) - (b.cheapest.price_total / b.cheapest.nights))
    : groupSort === 'rating'
    ? [...rawGroups].sort((a, b) => (b.taRating ?? -1) - (a.taRating ?? -1))
    : rawGroups;

  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
        {/* Group sort — only in grouped/cards mode */}
        <div className="flex items-center gap-2">
          {viewMode !== 'flat' && (
            <>
              <span className="text-slate-400">Sortuj:</span>
              {(['default', 'price_per_night', 'rating'] as const).map((s) => {
                const label = s === 'default' ? 'Domyślnie' : s === 'price_per_night' ? 'Cena/noc' : 'Ocena TA';
                return (
                  <button
                    key={s}
                    onClick={() => setGroupSort(s)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${groupSort === s ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Widok:</span>
          {(['list', 'cards', 'grouped', 'flat'] as const).map((mode) => {
            const label = mode === 'list' ? 'Lista' : mode === 'grouped' ? 'Tabela' : mode === 'cards' ? 'Karty' : 'Wszystkie';
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${viewMode === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === 'list' ? (
        <HotelList groups={groups} trends={trends} />
      ) : viewMode === 'cards' ? (
        <HotelCards groups={groups} trends={trends} />
      ) : (
      <div className="card overflow-x-auto">
        {viewMode === 'grouped' ? (
          /* ─── GROUPED TABLE ─── */
          <table className="offers-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input type="checkbox" checked={false} onChange={() => {}} className="h-3.5 w-3.5 opacity-0" />
                </th>
                {th('Hotel', 'hotel_name')}
                <th>Kraj</th>
                {th('*', 'hotel_stars')}
                <th>Wyż.</th>
                {th('Min. cena', 'price_total')}
                {th('Min./os.', 'price_per_person')}
                <th>Biura podróży</th>
                {th('TripAdv.', 'tripadvisor_rating')}
                {th('Jedzenie', 'tripadvisor_food_score')}
                <th>Tagi</th>
                {th('Score', 'composite_score')}
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isReviewExpanded = group.hotelId ? expandedHotels.has(group.hotelId) : false;
                const isLoadingThis = group.hotelId ? loadingReviews.has(group.hotelId) : false;
                const cachedReviews = group.hotelId ? reviewsCache.get(group.hotelId) : undefined;
                const isGroupExpanded = expandedKeys.has(group.key);
                const oldPrice = group.hotelId ? (trends?.[group.hotelId] ?? null) : null;
                const trendPct = oldPrice ? ((group.cheapest.price_total - oldPrice) / oldPrice) * 100 : null;

                return (
                  <Fragment key={group.key}>
                    <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleGroupExpand(group.key)}>
                      {/* Checkbox placeholder */}
                      <td onClick={(e) => { e.stopPropagation(); toggleSelect(group.cheapest.id); }} className="text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(group.cheapest.id)}
                          onChange={() => {}}
                          className="h-3.5 w-3.5"
                        />
                      </td>

                      {/* Hotel name */}
                      <td className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {group.hotelPhotoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={group.hotelPhotoUrl}
                              alt=""
                              className="w-10 h-10 rounded object-cover flex-shrink-0 bg-slate-100"
                              loading="lazy"
                            />
                          )}
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              {group.hotelId ? (
                                <Link href={`/hotels/${group.hotelId}`} className="hover:text-blue-600 hover:underline">
                                  {group.hotelName}
                                </Link>
                              ) : (
                                group.hotelName
                              )}
                              {group.hotelId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void toggleReviews(group.hotelId!); }}
                                  className="text-slate-400 hover:text-slate-600 text-xs leading-none"
                                  title="Pokaz opinie"
                                >
                                  {isLoadingThis ? (
                                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                                  ) : isReviewExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>
                            {group.hotelLocation && (
                              <div className="text-xs text-slate-400 mt-0.5">{group.hotelLocation}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="whitespace-nowrap text-sm">
                        {group.destDisplay ?? '-'}
                      </td>

                      {/* Stars */}
                      <td className="text-sm whitespace-nowrap">
                        <span className="stars">{stars(group.hotelStars)}</span>
                      </td>

                      {/* Board + nights range */}
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <span className="badge bg-teal-50 text-teal-700 text-xs">
                            {BOARD_LABELS[group.cheapest.board_type] ?? group.cheapest.board_type}
                          </span>
                          <span className="text-xs text-slate-400">
                            {group.nightsMin === group.nightsMax ? `${group.nightsMin}n` : `${group.nightsMin}–${group.nightsMax}n`}
                          </span>
                        </div>
                      </td>

                      {/* Min price + trend */}
                      <td className="text-right font-semibold text-slate-900 whitespace-nowrap">
                        {trendPct !== null && Math.abs(trendPct) >= 3 && (
                          <span className={`text-xs font-medium mr-1 ${trendPct < 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {trendPct < 0 ? '↓' : '↑'}{Math.abs(Math.round(trendPct))}%
                          </span>
                        )}
                        {group.cheapest.price_total.toLocaleString('pl-PL')} zl
                      </td>

                      {/* Min per person */}
                      <td className="text-right text-sm text-slate-600 whitespace-nowrap">
                        {group.cheapest.price_per_person.toLocaleString('pl-PL')} zl
                      </td>

                      {/* Providers */}
                      <td className="min-w-[160px]">
                        <div className="flex flex-wrap gap-1">
                          {group.providers
                            .sort((a, b) => a.price - b.price)
                            .map((p) => (
                              <a
                                key={p.code}
                                href={group.offers.find((o) => o.id === p.offerId)?.source_url ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`${PROVIDER_COLORS[p.code] ?? 'badge bg-slate-100 text-slate-600'} text-xs whitespace-nowrap`}
                                title={p.name}
                              >
                                {p.name.length > 7 ? p.code.toUpperCase() : p.name} {p.price.toLocaleString('pl-PL')}
                              </a>
                            ))}
                        </div>
                      </td>

                      {/* TA rating */}
                      <td className="text-center">
                        {group.taRating !== null ? (
                          <div className="inline-flex items-center gap-1 text-sm">
                            <span className="text-amber-500">*</span>
                            <span className="font-medium">{formatRating(group.taRating)}</span>
                            {group.taReviews && (
                              <span className="text-slate-400 text-xs">({group.taReviews.toLocaleString('pl-PL')})</span>
                            )}
                          </div>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>

                      {/* Food score */}
                      <td className="text-center">
                        {group.taFoodScore !== null ? (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            (group.taFoodScore ?? 0) >= 4.5 ? 'bg-green-100 text-green-700'
                            : (group.taFoodScore ?? 0) >= 4.0 ? 'bg-lime-100 text-lime-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {formatRating(group.taFoodScore)}
                          </span>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>

                      {/* Tags */}
                      <td className="max-w-[180px]">
                        <div className="flex flex-wrap gap-1">
                          {(group.taTags ?? []).slice(0, 2).map((tag) => (
                            <span key={tag} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 truncate max-w-[100px]" title={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="text-center">
                        {group.compositeScore !== null ? (
                          <span className={getScoreClass(group.compositeScore)}>{group.compositeScore}</span>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>

                      {/* Expand icon */}
                      <td className="text-center text-slate-400 text-xs">
                        {group.offers.length > 1 && (
                          <span title={`${group.offers.length} ofert`}>
                            {isGroupExpanded ? '▲' : `+${group.offers.length}`}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded: all individual offers */}
                    {isGroupExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={COL_COUNT_GROUP} className="px-6 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-200">
                                <th className="text-left py-1 pr-3 font-medium">Biuro</th>
                                <th className="text-left py-1 pr-3 font-medium">Wylot</th>
                                <th className="text-center py-1 pr-3 font-medium">Lotnisko</th>
                                <th className="text-center py-1 pr-3 font-medium">Noce</th>
                                <th className="text-left py-1 pr-3 font-medium">Wyżyw.</th>
                                <th className="text-right py-1 pr-3 font-medium">Cena</th>
                                <th className="text-right py-1 font-medium">Link</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.offers
                                .sort((a, b) => a.price_total - b.price_total)
                                .map((o) => (
                                  <tr key={o.id} className="hover:bg-slate-100">
                                    <td className="py-1.5 pr-3">
                                      <span className={`${PROVIDER_COLORS[o.provider_code] ?? 'badge bg-slate-100 text-slate-600'} text-xs`}>
                                        {o.provider_name}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-3 whitespace-nowrap">{o.departure_date}</td>
                                    <td className="py-1.5 pr-3 text-center text-slate-500">{o.departure_airport}</td>
                                    <td className="py-1.5 pr-3 text-center text-slate-600">{o.nights}</td>
                                    <td className="py-1.5 pr-3 text-slate-500">
                                      {BOARD_LABELS[o.board_type] ?? o.board_type}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                                      {o.price_total.toLocaleString('pl-PL')} zl
                                      <span className="ml-1 text-slate-400 font-normal">
                                        ({o.price_per_person.toLocaleString('pl-PL')}/os.)
                                      </span>
                                    </td>
                                    <td className="py-1.5 text-right">
                                      <a
                                        href={o.source_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 underline"
                                      >
                                        Otworz
                                      </a>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* Expanded reviews */}
                    {isReviewExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={COL_COUNT_GROUP} className="px-6 py-4">
                          {isLoadingThis && !cachedReviews ? (
                            <div className="text-xs text-slate-400">Ladowanie opinii...</div>
                          ) : cachedReviews && cachedReviews.length > 0 ? (
                            <ReviewPanel sources={cachedReviews} />
                          ) : (
                            <div className="text-xs text-slate-400 italic">
                              Brak opinii — uruchom skrypt enrich-hotels, aby pobrać dane z TripAdvisor i Booking.com.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* ─── FLAT TABLE ─── */
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
                <th>Wyz.</th>
                {th('*', 'hotel_stars')}
                {th('Cena', 'price_total')}
                {th('Cena/os.', 'price_per_person')}
                {th('TripAdv.', 'tripadvisor_rating')}
                {th('TA Jedzenie', 'tripadvisor_food_score')}
                <th>Tagi</th>
                {th('Score', 'composite_score')}
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const isExpanded = offer.hotel_id ? expandedHotels.has(offer.hotel_id) : false;
                const isLoadingThis = offer.hotel_id ? loadingReviews.has(offer.hotel_id) : false;
                const cachedReviews = offer.hotel_id ? reviewsCache.get(offer.hotel_id) : undefined;

                return (
                  <Fragment key={offer.id}>
                    <tr className={selected.has(offer.id) ? 'bg-blue-50' : ''}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(offer.id)}
                          onChange={() => toggleSelect(offer.id)}
                          className="h-3.5 w-3.5"
                        />
                      </td>
                      <td className="min-w-[200px]">
                        <div className="flex items-center gap-2">
                          {offer.hotel_photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={offer.hotel_photo_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 bg-slate-100" loading="lazy" />
                          )}
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              {offer.hotel_id ? (
                                <Link href={`/hotels/${offer.hotel_id}`} className="hover:text-blue-600 hover:underline">
                                  {offer.hotel_name}
                                </Link>
                              ) : offer.hotel_name}
                              {offer.hotel_id && (
                                <button
                                  onClick={() => void toggleReviews(offer.hotel_id!)}
                                  className="text-slate-400 hover:text-slate-600 text-xs leading-none"
                                  title="Pokaz opinie"
                                >
                                  {isLoadingThis ? (
                                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                                  ) : isExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>
                            {offer.hotel_location && (
                              <div className="text-xs text-slate-400 mt-0.5">{offer.hotel_location}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="text-sm">{offer.destination_display ?? offer.country_code ?? '-'}</div>
                        <div className="text-xs text-slate-400">{offer.departure_airport}</div>
                      </td>
                      <td>
                        <span className={PROVIDER_COLORS[offer.provider_code] ?? 'badge bg-slate-100 text-slate-600'}>
                          {offer.provider_name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-sm">{offer.departure_date}</td>
                      <td className="text-center text-sm font-medium">{offer.nights}</td>
                      <td>
                        <span className="badge bg-teal-50 text-teal-700 text-xs">
                          {BOARD_LABELS[offer.board_type] ?? offer.board_type}
                        </span>
                      </td>
                      <td className="text-sm whitespace-nowrap"><span className="stars">{stars(offer.hotel_stars)}</span></td>
                      <td className="text-right font-semibold text-slate-900 whitespace-nowrap">
                        {offer.price_total.toLocaleString('pl-PL')} zl
                      </td>
                      <td className="text-right text-sm text-slate-600 whitespace-nowrap">
                        {offer.price_per_person.toLocaleString('pl-PL')} zl
                      </td>
                      <td className="text-center">
                        {offer.tripadvisor_rating !== null ? (
                          <div className="inline-flex items-center gap-1 text-sm">
                            <span className="text-amber-500">*</span>
                            <span className="font-medium">{formatRating(offer.tripadvisor_rating)}</span>
                            {offer.tripadvisor_reviews && (
                              <span className="text-slate-400 text-xs">({offer.tripadvisor_reviews.toLocaleString('pl-PL')})</span>
                            )}
                          </div>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td className="text-center">
                        {offer.tripadvisor_food_score !== null ? (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            (offer.tripadvisor_food_score ?? 0) >= 4.5 ? 'bg-green-100 text-green-700'
                            : (offer.tripadvisor_food_score ?? 0) >= 4.0 ? 'bg-lime-100 text-lime-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {formatRating(offer.tripadvisor_food_score)}
                          </span>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td className="max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {(offer.tripadvisor_tags ?? []).slice(0, 3).map((tag) => (
                            <span key={tag} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 truncate max-w-[120px]" title={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-center">
                        {offer.composite_score !== null ? (
                          <span className={getScoreClass(offer.composite_score)}>{offer.composite_score}</span>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td>
                        <a href={offer.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs underline whitespace-nowrap">
                          Otworz
                        </a>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={COL_COUNT_FLAT} className="px-6 py-4">
                          {isLoadingThis && !cachedReviews ? (
                            <div className="text-xs text-slate-400">Ladowanie opinii...</div>
                          ) : cachedReviews && cachedReviews.length > 0 ? (
                            <ReviewPanel sources={cachedReviews} />
                          ) : (
                            <div className="text-xs text-slate-400 italic">
                              Brak opinii dla tego hotelu.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}

// ─── List view (lastminuter.pl style) ────────────────────────────────────────

function HotelList({ groups, trends }: { groups: HotelGroup[]; trends?: Record<string, number> }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {groups.map((group) => {
        const oldPrice = group.hotelId ? (trends?.[group.hotelId] ?? null) : null;
        const trendPct = oldPrice ? ((group.cheapest.price_total - oldPrice) / oldPrice) * 100 : null;
        const airports = [...new Set(group.offers.map((o) => o.departure_airport))];
        const boardLabel = BOARD_LABELS[group.cheapest.board_type] ?? group.cheapest.board_type;

        return (
          <div
            key={group.key}
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-blue-50/30 transition-colors"
          >
            {/* Thumbnail */}
            <div className="flex-shrink-0 w-[72px] h-[56px] rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-slate-200">
              {group.hotelPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.hotelPhotoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl opacity-20 select-none">🏨</div>
              )}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Headline */}
              <div className="font-semibold text-slate-900 leading-snug mb-1 truncate">
                {group.destDisplay && (
                  <span className="text-slate-400 font-normal">{group.destDisplay}: </span>
                )}
                {group.hotelId ? (
                  <Link href={`/hotels/${group.hotelId}`} className="hover:text-blue-600 hover:underline">
                    {group.hotelName}
                  </Link>
                ) : (
                  group.hotelName
                )}
                {' '}
                <span className="stars text-xs">{stars(group.hotelStars)}</span>
              </div>

              {/* Tag pills */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {airports.slice(0, 4).map((ap) => (
                  <span key={ap} className="inline-flex items-center gap-0.5 text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                    ✈ {ap}
                  </span>
                ))}
                <span className="text-slate-400">
                  {group.nightsMin === group.nightsMax
                    ? `${group.nightsMin} nocy`
                    : `${group.nightsMin}–${group.nightsMax} nocy`}
                </span>
                <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 font-medium">
                  {boardLabel}
                </span>
                {group.taRating !== null && (
                  <span className="text-amber-600 font-semibold">
                    ★ {formatRating(group.taRating)}
                    {group.taReviews ? (
                      <span className="text-slate-400 font-normal ml-0.5">
                        ({group.taReviews.toLocaleString('pl-PL')})
                      </span>
                    ) : null}
                  </span>
                )}
              </div>

              {/* Provider badges */}
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {group.providers
                  .sort((a, b) => a.price - b.price)
                  .slice(0, 4)
                  .map((p) => (
                    <a
                      key={p.code}
                      href={group.offers.find((o) => o.id === p.offerId)?.source_url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${PROVIDER_COLORS[p.code] ?? 'badge bg-slate-100 text-slate-600'} text-xs`}
                    >
                      {p.name.length > 8 ? p.code.toUpperCase() : p.name} →
                    </a>
                  ))}
              </div>

              {/* Review summary — inline, always visible when data present */}
              {(group.taRating !== null || (group.taTags && group.taTags.length > 0)) && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                  {group.taRating !== null && (
                    <span className="text-amber-600 font-semibold">
                      ★ {formatRating(group.taRating)}
                      {group.taReviews ? (
                        <span className="text-slate-400 font-normal ml-0.5 text-[11px]">
                          {' '}({group.taReviews >= 1000
                            ? `${(group.taReviews / 1000).toFixed(1)}k`
                            : group.taReviews} opinii)
                        </span>
                      ) : null}
                    </span>
                  )}
                  {group.taFoodScore !== null && (
                    <span className={`rounded px-1.5 py-0.5 ${
                      (group.taFoodScore ?? 0) >= 4.5 ? 'bg-green-50 text-green-700'
                      : (group.taFoodScore ?? 0) >= 4.0 ? 'bg-lime-50 text-lime-700'
                      : 'bg-amber-50 text-amber-700'
                    }`}>
                      🍽 {formatRating(group.taFoodScore)}
                    </span>
                  )}
                  {group.taTags?.slice(0, 3).map((tag) => (
                    <span key={tag} className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Price column */}
            <div className="flex-shrink-0 text-right min-w-[110px]">
              {trendPct !== null && Math.abs(trendPct) >= 3 && (
                <div className={`text-xs font-semibold mb-0.5 ${trendPct < 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {trendPct < 0 ? '↓' : '↑'}{Math.abs(Math.round(trendPct))}%
                </div>
              )}
              <div className="text-xl font-bold text-slate-900 leading-none">
                {group.cheapest.price_total.toLocaleString('pl-PL')}
                <span className="text-sm font-medium text-slate-500 ml-1">zł</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {group.cheapest.price_per_person.toLocaleString('pl-PL')} zł/os.
              </div>
              {group.compositeScore !== null && (
                <div className="mt-1 flex justify-end">
                  <span className={getScoreClass(group.compositeScore)}>{group.compositeScore}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────

function HotelCards({ groups, trends }: { groups: HotelGroup[]; trends?: Record<string, number> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {groups.map((group) => {
        const oldPrice = group.hotelId ? (trends?.[group.hotelId] ?? null) : null;
        const trendPct = oldPrice ? ((group.cheapest.price_total - oldPrice) / oldPrice) * 100 : null;
        return (
        <div key={group.key} className="card overflow-hidden hover:shadow-md transition-shadow flex flex-col">
          {/* Photo */}
          <div className="relative h-40 bg-gradient-to-br from-blue-50 to-slate-200 flex-shrink-0">
            {group.hotelPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.hotelPhotoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl select-none opacity-20">
                🏨
              </div>
            )}
            {group.compositeScore !== null && (
              <div className={`absolute top-2 right-2 ${getScoreClass(group.compositeScore)} shadow-sm`}>
                {group.compositeScore}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-3 flex flex-col gap-2 flex-1">
            <div>
              <div className="font-semibold text-slate-900 text-sm leading-tight">
                {group.hotelId ? (
                  <Link href={`/hotels/${group.hotelId}`} className="hover:text-blue-600 hover:underline">
                    {group.hotelName}
                  </Link>
                ) : group.hotelName}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="stars text-xs">{stars(group.hotelStars)}</span>
                {group.destDisplay && (
                  <span className="text-xs text-slate-400">{group.destDisplay}</span>
                )}
              </div>
            </div>

            {group.taRating !== null && (
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <span className="text-amber-500">★</span>
                <span className="font-semibold">{formatRating(group.taRating)}</span>
                {group.taReviews && (
                  <span className="text-slate-400">({group.taReviews.toLocaleString('pl-PL')})</span>
                )}
                {group.taFoodScore !== null && (
                  <span className={`ml-1 font-medium ${group.taFoodScore >= 4.5 ? 'text-green-600' : group.taFoodScore >= 4 ? 'text-lime-600' : 'text-amber-600'}`}>
                    Jed: {formatRating(group.taFoodScore)}
                  </span>
                )}
              </div>
            )}

            {/* Board type + nights range */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="badge bg-teal-50 text-teal-700 text-xs">
                {BOARD_LABELS[group.cheapest.board_type] ?? group.cheapest.board_type}
              </span>
              <span className="text-xs text-slate-400">
                {group.nightsMin === group.nightsMax ? `${group.nightsMin}n` : `${group.nightsMin}–${group.nightsMax}n`}
              </span>
            </div>

            <div className="flex items-end justify-between mt-auto pt-2 border-t border-slate-100">
              <div>
                <div className="flex items-center gap-1">
                  {trendPct !== null && Math.abs(trendPct) >= 3 && (
                    <span className={`text-xs font-semibold ${trendPct < 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {trendPct < 0 ? '↓' : '↑'}{Math.abs(Math.round(trendPct))}%
                    </span>
                  )}
                  <div className="text-base font-bold text-slate-900">
                    {group.cheapest.price_total.toLocaleString('pl-PL')} zł
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {group.cheapest.price_per_person.toLocaleString('pl-PL')} zł/os.
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1 max-w-[130px]">
                {group.providers
                  .sort((a, b) => a.price - b.price)
                  .slice(0, 3)
                  .map((p) => (
                    <a
                      key={p.code}
                      href={group.offers.find((o) => o.id === p.offerId)?.source_url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${PROVIDER_COLORS[p.code] ?? 'badge bg-slate-100 text-slate-600'} text-xs`}
                    >
                      {p.code.toUpperCase()}
                    </a>
                  ))}
              </div>
            </div>

            {(group.taTags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {group.taTags!.slice(0, 2).map((tag) => (
                  <span key={tag} className="inline-block rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 text-xs text-slate-500 truncate max-w-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function ReviewPanel({ sources }: { sources: ReviewSource[] }) {
  const ta = sources.find((s) => s.source === 'tripadvisor');
  const bk = sources.find((s) => s.source === 'booking');
  const allSnippets = sources.flatMap((s) =>
    s.reviewSnippets.map((r) => ({ ...r, source: s.source })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {ta && ta.overallRating !== null && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-green-600 font-semibold">TripAdvisor</span>
            <span className="font-bold text-slate-800">{ta.overallRating}/5</span>
            {ta.foodScore !== null && (
              <span className="text-slate-500">Jedzenie: <span className="font-medium text-slate-700">{ta.foodScore}</span></span>
            )}
          </div>
        )}
        {bk && bk.overallRating !== null && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-blue-600 font-semibold">Booking.com (PL)</span>
            <span className="font-bold text-slate-800">{bk.overallRating}/5</span>
            {bk.foodScore !== null && (
              <span className="text-slate-500">Jedzenie: <span className="font-medium text-slate-700">{bk.foodScore}</span></span>
            )}
          </div>
        )}
      </div>

      {sources.some((s) => s.sentimentTags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {sources.flatMap((s) =>
            s.sentimentTags.map((tag) => (
              <span key={`${s.source}-${tag}`} className="badge bg-slate-100 text-slate-600 text-xs">{tag}</span>
            )),
          )}
        </div>
      )}

      {allSnippets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {allSnippets.slice(0, 6).map((s, i) => (
            <blockquote
              key={i}
              className={`rounded-lg px-3 py-2 border-l-2 text-xs text-slate-700 leading-relaxed ${
                s.source === 'tripadvisor' ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-300'
              }`}
            >
              <p className="line-clamp-3">{s.text}</p>
              {s.rating !== null && (
                <div className="mt-1 text-slate-400">
                  {''.padStart(Math.round(s.rating), '*')} <span className="text-slate-300">({s.source === 'tripadvisor' ? 'TA' : 'BK'})</span>
                </div>
              )}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
