'use client';

import { useState } from 'react';
import type { UIFilter } from '@/lib/types';

const DESTINATIONS = [
  { value: 'turkey', label: 'Turcja' },
  { value: 'egypt', label: 'Egipt' },
  { value: 'greece', label: 'Grecja' },
  { value: 'spain', label: 'Hiszpania' },
  { value: 'cyprus', label: 'Cypr' },
  { value: 'tunisia', label: 'Tunezja' },
  { value: 'bulgaria', label: 'Bułgaria' },
  { value: 'croatia', label: 'Chorwacja' },
  { value: 'malta', label: 'Malta' },
  { value: 'canary-islands', label: 'Wyspy Kanaryjskie' },
  { value: 'portugal', label: 'Portugalia' },
  { value: 'morocco', label: 'Maroko' },
  { value: 'albania', label: 'Albania' },
  { value: 'montenegro', label: 'Czarnogóra' },
];

const AIRPORTS = [
  { value: 'KTW', label: 'Katowice (KTW)' },
  { value: 'KRK', label: 'Kraków (KRK)' },
  { value: 'WAW', label: 'Warszawa (WAW)' },
  { value: 'GDN', label: 'Gdańsk (GDN)' },
  { value: 'POZ', label: 'Poznań (POZ)' },
  { value: 'WRO', label: 'Wrocław (WRO)' },
  { value: 'RZE', label: 'Rzeszów (RZE)' },
];

const BOARD_TYPES = [
  { value: 'all-inclusive', label: 'All Inclusive' },
  { value: 'ultra-all-inclusive', label: 'Ultra All Inclusive' },
  { value: 'half-board', label: 'Half Board' },
  { value: 'full-board', label: 'Full Board' },
  { value: 'bed-and-breakfast', label: 'Śniadanie' },
  { value: 'room-only', label: 'Bez wyżywienia' },
];

const PROVIDERS = [
  { value: 'rpl', label: 'R.pl' },
  { value: 'exim', label: 'Exim Tours' },
  { value: 'coral', label: 'Coral Travel' },
  { value: 'itaka', label: 'Itaka' },
  { value: 'grecos', label: 'Grecos' },
  { value: 'tui', label: 'TUI' },
  { value: 'wakacjepl', label: 'Wakacje.pl' },
];

interface Props {
  defaultFilter: UIFilter;
  onSearch: (filter: UIFilter) => void;
}

function MultiCheckbox({
  options,
  selected,
  onChange,
  cols = 3,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  cols?: number;
}) {
  const toggle = (val: string) => {
    onChange(
      selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val],
    );
  };

  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 group-hover:text-slate-900">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function SearchForm({ defaultFilter, onSearch }: Props) {
  const [filter, setFilter] = useState<UIFilter>(defaultFilter);
  const [open, setOpen] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState('');

  const set = <K extends keyof UIFilter>(key: K, value: UIFilter[K]) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filter);
  };

  const handleScrape = async () => {
    const secret = window.prompt('Podaj SCRAPE_API_SECRET:');
    if (!secret) return;

    setScraping(true);
    setScrapeMsg('');
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scrape-secret': secret,
        },
        body: JSON.stringify({
          providers: filter.providers?.length ? filter.providers : undefined,
          destinations: filter.destinations,
          dateFrom: filter.dateFrom,
          dateTo: filter.dateTo,
        }),
      });

      const json = await res.json() as { message?: string; error?: string };
      setScrapeMsg(json.message ?? json.error ?? 'OK');
    } catch (err) {
      setScrapeMsg(String(err));
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Header / toggle */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <span className="text-blue-500">⚙</span>
          Filtry wyszukiwania
        </h2>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-slate-100">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">
            {/* Destinations */}
            <div>
              <span className="label">Kierunki</span>
              <MultiCheckbox
                options={DESTINATIONS}
                selected={filter.destinations}
                onChange={(v) => set('destinations', v)}
                cols={2}
              />
            </div>

            {/* Airports */}
            <div>
              <span className="label">Lotnisko wylotu</span>
              <MultiCheckbox
                options={AIRPORTS}
                selected={filter.airports}
                onChange={(v) => set('airports', v)}
                cols={1}
              />
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Wylot od</label>
                  <input
                    type="date"
                    className="input"
                    value={filter.dateFrom}
                    onChange={(e) => set('dateFrom', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Wylot do</label>
                  <input
                    type="date"
                    className="input"
                    value={filter.dateTo}
                    onChange={(e) => set('dateTo', e.target.value)}
                  />
                </div>
              </div>

              {/* Nights */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Noce min</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={30}
                    value={filter.nightsMin}
                    onChange={(e) => set('nightsMin', parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <label className="label">Noce max</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={30}
                    value={filter.nightsMax}
                    onChange={(e) => set('nightsMax', parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              {/* Adults */}
              <div>
                <label className="label">Dorośli</label>
                <select
                  className="input"
                  value={filter.adults}
                  onChange={(e) => set('adults', parseInt(e.target.value, 10))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Max price */}
              <div>
                <label className="label">Cena max (PLN, łącznie)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Bez limitu"
                  step={500}
                  value={filter.priceMax ?? ''}
                  onChange={(e) =>
                    set('priceMax', e.target.value ? parseInt(e.target.value, 10) : undefined)
                  }
                />
              </div>

              {/* Review score filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Min. ocena TA</label>
                  <select
                    className="input"
                    value={filter.minTaRating ?? ''}
                    onChange={(e) =>
                      set('minTaRating', e.target.value ? parseFloat(e.target.value) : undefined)
                    }
                  >
                    <option value="">Dowolna</option>
                    <option value="3.5">3.5+</option>
                    <option value="4.0">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                </div>
                <div>
                  <label className="label">Min. jedzenie TA</label>
                  <select
                    className="input"
                    value={filter.minFoodScore ?? ''}
                    onChange={(e) =>
                      set('minFoodScore', e.target.value ? parseFloat(e.target.value) : undefined)
                    }
                  >
                    <option value="">Dowolne</option>
                    <option value="3.5">3.5+</option>
                    <option value="4.0">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-5 pb-5">
            {/* Stars */}
            <div>
              <span className="label">Standard hotelu</span>
              <MultiCheckbox
                options={[
                  { value: '5', label: '★★★★★ 5 gwiazdek' },
                  { value: '4', label: '★★★★ 4 gwiazdki' },
                  { value: '3', label: '★★★ 3 gwiazdki' },
                ]}
                selected={filter.stars.map(String)}
                onChange={(v) => set('stars', v.map(Number))}
                cols={1}
              />
            </div>

            {/* Board types */}
            <div>
              <span className="label">Wyżywienie</span>
              <MultiCheckbox
                options={BOARD_TYPES}
                selected={filter.boardTypes}
                onChange={(v) => set('boardTypes', v)}
                cols={1}
              />
            </div>

            {/* Providers */}
            <div>
              <span className="label">Biuro podróży</span>
              <MultiCheckbox
                options={PROVIDERS}
                selected={filter.providers ?? []}
                onChange={(v) => set('providers', v)}
                cols={2}
              />
              <p className="text-xs text-slate-400 mt-1">
                (puste = wszystkie)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-100 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button type="submit" className="btn-primary">
                Szukaj
              </button>
              <button
                type="button"
                onClick={() => { setFilter(defaultFilter); onSearch(defaultFilter); }}
                className="btn-ghost text-sm"
              >
                Resetuj
              </button>
            </div>

            <div className="flex items-center gap-3">
              {scrapeMsg && (
                <span className="text-xs text-slate-600 max-w-xs truncate">{scrapeMsg}</span>
              )}
              <button
                type="button"
                onClick={handleScrape}
                disabled={scraping}
                className="btn-secondary text-xs"
                title="Uruchom scraper dla wybranych filtrów"
              >
                {scraping ? 'Uruchamianie...' : '▶ Uruchom scraper'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
