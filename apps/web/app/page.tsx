'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import SearchForm from '@/components/SearchForm';
import OffersTable from '@/components/OffersTable';
import ScrapeButton from '@/components/ScrapeButton';
import type { OfferRow, UIFilter, LiveOffer } from '@/lib/types';

const DEFAULT_FILTER: UIFilter = {
  destinations: ['turkey', 'egypt', 'greece', 'spain', 'cyprus', 'tunisia', 'bulgaria'],
  airports: ['KTW', 'KRK'],
  dateFrom: new Date().toISOString().split('T')[0]!,
  dateTo: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
  nightsMin: 5,
  nightsMax: 16,
  adults: 2,
  stars: [3, 4, 5],
  boardTypes: ['all-inclusive', 'ultra-all-inclusive'],
  sortBy: 'composite_score',
  sortOrder: 'desc',
};

export default function HomePage() {
  const [filter, setFilter] = useState<UIFilter>(DEFAULT_FILTER);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Live search state
  const [liveOffers, setLiveOffers] = useState<LiveOffer[]>([]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [liveProgress, setLiveProgress] = useState<string[]>([]);
  const liveAbortRef = useRef<AbortController | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchOffers = useCallback(
    async (f: UIFilter, p: number = 1) => {
      // Cancel previous request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (f.destinations.length) params.set('destinations', f.destinations.join(','));
      if (f.airports.length) params.set('airports', f.airports.join(','));
      if (f.dateFrom) params.set('dateFrom', f.dateFrom);
      if (f.dateTo) params.set('dateTo', f.dateTo);
      params.set('nightsMin', f.nightsMin.toString());
      params.set('nightsMax', f.nightsMax.toString());
      params.set('adults', f.adults.toString());
      if (f.stars.length) params.set('stars', f.stars.join(','));
      if (f.boardTypes.length) params.set('boardTypes', f.boardTypes.join(','));
      if (f.priceMax) params.set('priceMax', f.priceMax.toString());
      if (f.providers?.length) params.set('providers', f.providers.join(','));
      params.set('sortBy', f.sortBy);
      params.set('sortOrder', f.sortOrder);
      params.set('page', p.toString());
      params.set('pageSize', '50');

      try {
        const res = await fetch(`/api/offers?${params.toString()}`, {
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json() as { data: OfferRow[]; total: number; page: number; pages: number };
        setOffers(json.data);
        setTotal(json.total);
        setPage(json.page);
        setPages(json.pages);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Błąd ładowania danych');
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchOffers(filter, 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close EventSource on unmount
  useEffect(() => () => { liveAbortRef.current?.abort(); }, []);

  const handleSearch = (f: UIFilter) => {
    setFilter(f);
    setPage(1);
    setSelected(new Set());
    void fetchOffers(f, 1);
  };

  const handleSort = (column: string) => {
    const newFilter = {
      ...filter,
      sortBy: column,
      sortOrder: (filter.sortBy === column && filter.sortOrder === 'desc' ? 'asc' : 'desc') as 'asc' | 'desc',
    };
    setFilter(newFilter);
    void fetchOffers(newFilter, 1);
  };

  const handleLiveSearch = () => {
    // Cancel any previous live search
    liveAbortRef.current?.abort();
    liveAbortRef.current = new AbortController();

    setLiveOffers([]);
    setLiveProgress([]);
    setLiveStatus('loading');

    const params = new URLSearchParams();
    if (filter.destinations.length) params.set('destinations', filter.destinations.join(','));
    if (filter.airports.length) params.set('airports', filter.airports.join(','));
    if (filter.boardTypes.length) params.set('boardTypes', filter.boardTypes.join(','));
    params.set('dateFrom', filter.dateFrom);
    params.set('dateTo', filter.dateTo);
    params.set('nightsMin', filter.nightsMin.toString());
    params.set('nightsMax', filter.nightsMax.toString());
    params.set('adults', filter.adults.toString());

    const evtSource = new EventSource(`/api/live-search?${params.toString()}`);
    liveAbortRef.current = new AbortController();
    liveAbortRef.current.signal.addEventListener('abort', () => evtSource.close());

    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          destination?: string;
          offers?: LiveOffer[];
          error?: string;
        };

        if (msg.type === 'batch') {
          const label = msg.destination ?? '';
          if (msg.offers && msg.offers.length > 0) {
            setLiveOffers((prev) => [...prev, ...msg.offers!]);
          }
          setLiveProgress((prev) => [
            ...prev,
            `${label}: ${msg.offers?.length ?? 0} ofert${msg.error ? ` (błąd: ${msg.error})` : ''}`,
          ]);
        } else if (msg.type === 'done') {
          setLiveStatus('done');
          evtSource.close();
        }
      } catch { /* malformed event */ }
    };

    evtSource.onerror = () => {
      setLiveStatus('done');
      evtSource.close();
    };
  };

  const handleExport = (fmt: 'xlsx' | 'csv') => {
    const params = new URLSearchParams();
    if (filter.destinations.length) params.set('destinations', filter.destinations.join(','));
    if (filter.airports.length) params.set('airports', filter.airports.join(','));
    if (filter.dateFrom) params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params.set('dateTo', filter.dateTo);
    params.set('nightsMin', filter.nightsMin.toString());
    params.set('nightsMax', filter.nightsMax.toString());
    if (filter.stars.length) params.set('stars', filter.stars.join(','));
    if (filter.boardTypes.length) params.set('boardTypes', filter.boardTypes.join(','));
    if (filter.priceMax) params.set('priceMax', filter.priceMax.toString());
    if (filter.providers?.length) params.set('providers', filter.providers.join(','));
    params.set('format', fmt);

    window.open(`/api/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Szukaj ofert wakacyjnych</h1>
          <p className="text-sm text-slate-500 mt-1">
            All-Inclusive z R.pl, Exim Tours, Itaka, Grecos i TUI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLiveSearch}
            disabled={liveStatus === 'loading'}
            className="btn-primary text-sm flex items-center gap-2"
            title="Pobierz oferty bezpośrednio z Itaka teraz (bez czekania na cron)"
          >
            {liveStatus === 'loading' ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Szukam...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Szukaj na żywo
              </>
            )}
          </button>
          <ScrapeButton />
        </div>
      </div>

      {/* Search form */}
      <SearchForm defaultFilter={DEFAULT_FILTER} onSearch={handleSearch} />

      {/* Results header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Ładowanie...
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Znaleziono <span className="font-semibold text-slate-900">{total.toLocaleString('pl-PL')}</span> ofert
              {selected.size > 0 && (
                <span className="ml-2 text-blue-600">
                  ({selected.size} zaznaczonych)
                </span>
              )}
            </p>
          )}

          {selected.size >= 2 && (
            <a
              href={`/compare?ids=${[...selected].slice(0, 5).join(',')}`}
              className="btn-primary text-xs"
            >
              Porównaj ({selected.size})
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('xlsx')}
            className="btn-secondary text-xs"
            disabled={total === 0}
          >
            Excel (.xlsx)
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="btn-secondary text-xs"
            disabled={total === 0}
          >
            CSV
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button
            className="ml-3 font-medium underline"
            onClick={() => fetchOffers(filter, page)}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Table */}
      <OffersTable
        offers={offers}
        loading={loading}
        sortBy={filter.sortBy}
        sortOrder={filter.sortOrder}
        onSort={handleSort}
        selected={selected}
        onSelectedChange={setSelected}
      />

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="btn-secondary text-sm"
            disabled={page <= 1}
            onClick={() => { setPage(p => p - 1); void fetchOffers(filter, page - 1); }}
          >
            ← Poprzednia
          </button>
          <span className="text-sm text-slate-600">
            Strona {page} z {pages}
          </span>
          <button
            className="btn-secondary text-sm"
            disabled={page >= pages}
            onClick={() => { setPage(p => p + 1); void fetchOffers(filter, page + 1); }}
          >
            Następna →
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && offers.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="font-semibold text-slate-700 mb-1">Brak wyników</h3>
          <p className="text-sm text-slate-500">
            Zmień filtry lub uruchom scraper, aby pobrać nowe oferty.
          </p>
          <a href="/history" className="btn-primary mt-4 text-sm inline-flex">
            Historia scrapów
          </a>
        </div>
      )}

      {/* Live search results */}
      {liveStatus !== 'idle' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Wyniki na żywo — Itaka
              {liveStatus === 'loading' && (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              )}
            </h2>
            {liveOffers.length > 0 && (
              <span className="text-sm text-slate-500">{liveOffers.length} ofert</span>
            )}
          </div>

          {/* Progress log */}
          {liveProgress.length > 0 && (
            <div className="text-xs text-slate-400 flex flex-wrap gap-2">
              {liveProgress.map((p, i) => (
                <span key={i} className="bg-slate-100 rounded px-2 py-0.5">{p}</span>
              ))}
            </div>
          )}

          {/* Live offers table */}
          {liveOffers.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2 text-left font-medium">Hotel</th>
                    <th className="px-4 py-2 text-left font-medium">Kraj</th>
                    <th className="px-3 py-2 text-center font-medium">Gwiazd</th>
                    <th className="px-3 py-2 text-center font-medium">Wylot</th>
                    <th className="px-3 py-2 text-center font-medium">Nocy</th>
                    <th className="px-3 py-2 text-center font-medium">Wyżyw.</th>
                    <th className="px-4 py-2 text-right font-medium">Cena</th>
                    <th className="px-3 py-2 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveOffers.slice(0, 100).map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800 max-w-[200px] truncate">
                        {o.hotelName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{o.destinationRaw}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{'★'.repeat(o.hotelStars)}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">
                        {o.departureDate} · {o.departureAirport}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{o.nights}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="badge bg-teal-50 text-teal-700 text-xs">
                          {o.boardType === 'all-inclusive' ? 'AI' :
                           o.boardType === 'ultra-all-inclusive' ? 'UAI' :
                           o.boardType.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {o.priceTotal.toLocaleString('pl-PL')} zł
                        <div className="text-xs text-slate-400 font-normal">
                          {o.pricePerPerson.toLocaleString('pl-PL')} / os.
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <a
                          href={o.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 text-xs"
                        >
                          Itaka →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {liveOffers.length > 100 && (
                <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                  Pokazano 100 z {liveOffers.length} wyników. Kliknij link przy ofercie, aby przejść do Itaka.
                </div>
              )}
            </div>
          )}

          {liveStatus === 'done' && liveOffers.length === 0 && (
            <div className="card p-6 text-center text-sm text-slate-500">
              Brak wyników z Itaka dla tych filtrów. Spróbuj zmienić destynacje lub daty.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
