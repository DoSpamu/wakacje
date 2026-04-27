'use client';

import { useState, useEffect, useRef } from 'react';
import type { UIFilter } from '@/lib/types';

// ─── Static data ────────────────────────────────────────────────────────────

const DESTINATIONS = [
  { value: 'turkey',        label: 'Turcja',            flag: '🇹🇷' },
  { value: 'egypt',         label: 'Egipt',             flag: '🇪🇬' },
  { value: 'greece',        label: 'Grecja',            flag: '🇬🇷' },
  { value: 'spain',         label: 'Hiszpania',         flag: '🇪🇸' },
  { value: 'cyprus',        label: 'Cypr',              flag: '🇨🇾' },
  { value: 'tunisia',       label: 'Tunezja',           flag: '🇹🇳' },
  { value: 'bulgaria',      label: 'Bułgaria',          flag: '🇧🇬' },
  { value: 'croatia',       label: 'Chorwacja',         flag: '🇭🇷' },
  { value: 'malta',         label: 'Malta',             flag: '🇲🇹' },
  { value: 'canary-islands',label: 'Wyspy Kanaryjskie', flag: '🏝️' },
  { value: 'portugal',      label: 'Portugalia',        flag: '🇵🇹' },
  { value: 'morocco',       label: 'Maroko',            flag: '🇲🇦' },
  { value: 'albania',       label: 'Albania',           flag: '🇦🇱' },
  { value: 'montenegro',    label: 'Czarnogóra',        flag: '🇲🇪' },
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
  { value: 'all-inclusive',       label: 'All Inclusive' },
  { value: 'ultra-all-inclusive', label: 'Ultra All Inclusive' },
  { value: 'half-board',          label: 'Half Board' },
  { value: 'full-board',          label: 'Full Board' },
  { value: 'bed-and-breakfast',   label: 'Śniadanie' },
  { value: 'room-only',           label: 'Bez wyżywienia' },
];

const PROVIDERS = [
  { value: 'rpl',       label: 'R.pl' },
  { value: 'exim',      label: 'Exim Tours' },
  { value: 'coral',     label: 'Coral Travel' },
  { value: 'itaka',     label: 'Itaka' },
  { value: 'grecos',    label: 'Grecos' },
  { value: 'tui',       label: 'TUI' },
  { value: 'wakacjepl', label: 'Wakacje.pl' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function destSummary(selected: string[]): string {
  if (!selected.length) return 'Wszystkie kierunki';
  const labels = selected.map((v) => DESTINATIONS.find((d) => d.value === v)?.label ?? v);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
}

function airportSummary(selected: string[]): string {
  if (!selected.length || selected.length === AIRPORTS.length) return 'Wszystkie lotniska';
  return selected.join(', ');
}

function dateSummary(from: string, to: string): string {
  if (!from && !to) return 'Dowolny termin';
  const fmt = (s: string) =>
    s
      ? new Date(s + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
      : '';
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `od ${fmt(from)}`;
  return `do ${fmt(to)}`;
}

function personsSummary(adults: number, min: number, max: number): string {
  const nights = min === max ? `${min} nocy` : `${min}–${max} nocy`;
  return `${adults} os. · ${nights}`;
}

// ─── FilterSlot ───────────────────────────────────────────────────────────────

function FilterSlot({
  label,
  summary,
  children,
  className = '',
}: {
  label: string;
  summary: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full text-left px-4 py-3 rounded-xl border bg-white transition-all ${
          open
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-1.5">
          {label}
        </div>
        <div className="text-sm font-semibold text-slate-800 truncate leading-none">{summary}</div>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 min-w-[220px]">
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full py-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800 border-t border-slate-100 pt-2.5 transition-colors"
          >
            Gotowe ✓
          </button>
        </div>
      )}
    </div>
  );
}

// ─── QuickChip ────────────────────────────────────────────────────────────────

function QuickChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-all ${
        active
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
      }`}
    >
      {active && (
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {label}
    </button>
  );
}

// ─── MultiCheckbox ────────────────────────────────────────────────────────────

function MultiCheckbox({
  options,
  selected,
  onChange,
  cols = 1,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => onChange(toggleItem(selected, opt.value))}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 group-hover:text-slate-900">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  defaultFilter: UIFilter;
  onSearch: (filter: UIFilter) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SearchForm({ defaultFilter, onSearch }: Props) {
  const [filter, setFilter] = useState<UIFilter>(defaultFilter);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof UIFilter>(key: K, value: UIFilter[K]) =>
    setFilter((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filter);
  };

  // Quick chip states
  const isAI = filter.boardTypes.some((b) => b === 'all-inclusive' || b === 'ultra-all-inclusive');
  const isMin4 = filter.stars.length > 0 && !filter.stars.includes(3);
  const isOnly5 = filter.stars.length === 1 && filter.stars[0] === 5;

  const toggleAI = () => {
    const ai = ['all-inclusive', 'ultra-all-inclusive'];
    if (isAI) {
      set('boardTypes', filter.boardTypes.filter((b) => !ai.includes(b)));
    } else {
      const base = filter.boardTypes.filter((b) => !ai.includes(b));
      set('boardTypes', [...base, ...ai]);
    }
  };

  const toggleMin4 = () => {
    if (isMin4) {
      set('stars', [...filter.stars, 3].sort((a, b) => a - b));
    } else {
      set('stars', filter.stars.filter((s) => s !== 3));
    }
  };

  const toggleOnly5 = () => {
    set('stars', isOnly5 ? [3, 4, 5] : [5]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">

      {/* ── Main search row ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-col sm:flex-row">

        {/* Departure airports */}
        <FilterSlot label="Skąd lecisz?" summary={airportSummary(filter.airports)} className="flex-1">
          <div className="space-y-1.5">
            {AIRPORTS.map((a) => (
              <label key={a.value} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={filter.airports.includes(a.value)}
                  onChange={() => set('airports', toggleItem(filter.airports, a.value))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-700">{a.label}</span>
              </label>
            ))}
          </div>
        </FilterSlot>

        {/* Destinations */}
        <FilterSlot label="Dokąd lecisz?" summary={destSummary(filter.destinations)} className="flex-[1.5]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 min-w-[280px]">
            {DESTINATIONS.map((d) => (
              <label key={d.value} className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={filter.destinations.includes(d.value)}
                  onChange={() => set('destinations', toggleItem(filter.destinations, d.value))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-700">
                  <span className="mr-1">{d.flag}</span>{d.label}
                </span>
              </label>
            ))}
          </div>
        </FilterSlot>

        {/* Date range */}
        <FilterSlot label="Kiedy?" summary={dateSummary(filter.dateFrom, filter.dateTo)} className="flex-1">
          <div className="space-y-3 min-w-[200px]">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Wylot od</label>
              <input type="date" className="input" value={filter.dateFrom}
                onChange={(e) => set('dateFrom', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Wylot do</label>
              <input type="date" className="input" value={filter.dateTo}
                onChange={(e) => set('dateTo', e.target.value)} />
            </div>
          </div>
        </FilterSlot>

        {/* Persons + nights */}
        <FilterSlot
          label="Podróżujący"
          summary={personsSummary(filter.adults, filter.nightsMin, filter.nightsMax)}
          className="flex-1"
        >
          <div className="space-y-3 min-w-[200px]">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Dorośli</label>
              <select className="input" value={filter.adults}
                onChange={(e) => set('adults', parseInt(e.target.value, 10))}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'dorosły' : 'dorosłych'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Noce min</label>
                <input type="number" className="input" min={1} max={30} value={filter.nightsMin}
                  onChange={(e) => set('nightsMin', parseInt(e.target.value, 10))} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Noce max</label>
                <input type="number" className="input" min={1} max={30} value={filter.nightsMax}
                  onChange={(e) => set('nightsMax', parseInt(e.target.value, 10))} />
              </div>
            </div>
          </div>
        </FilterSlot>

        {/* Search button */}
        <button
          type="submit"
          className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl px-7 py-3 flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg sm:self-stretch"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline">Szukaj</span>
        </button>
      </div>

      {/* ── Quick filter chips ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <QuickChip label="All Inclusive" active={isAI} onClick={toggleAI} />
        <QuickChip label="Min. 4★" active={isMin4} onClick={toggleMin4} />
        <QuickChip label="Tylko 5★" active={isOnly5} onClick={toggleOnly5} />

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={showAdvanced ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
            </svg>
            {showAdvanced ? 'Mniej filtrów' : 'Więcej filtrów'}
          </button>
          <button
            type="button"
            onClick={() => { setFilter(defaultFilter); onSearch(defaultFilter); }}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Resetuj
          </button>
        </div>
      </div>

      {/* ── Advanced filters ────────────────────────────────────────────── */}
      {showAdvanced && (
        <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
            />
          </div>

          <div>
            <span className="label">Wyżywienie</span>
            <MultiCheckbox options={BOARD_TYPES} selected={filter.boardTypes} onChange={(v) => set('boardTypes', v)} />
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Cena max (PLN, łącznie)</label>
              <input type="number" className="input" placeholder="Bez limitu" step={500}
                value={filter.priceMax ?? ''}
                onChange={(e) => set('priceMax', e.target.value ? parseInt(e.target.value, 10) : undefined)} />
            </div>
            <div>
              <label className="label">Min. ocena TripAdvisor</label>
              <select className="input" value={filter.minTaRating ?? ''}
                onChange={(e) => set('minTaRating', e.target.value ? parseFloat(e.target.value) : undefined)}>
                <option value="">Dowolna</option>
                <option value="3.5">3.5+</option>
                <option value="4.0">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div>
              <label className="label">Min. ocena jedzenia TA</label>
              <select className="input" value={filter.minFoodScore ?? ''}
                onChange={(e) => set('minFoodScore', e.target.value ? parseFloat(e.target.value) : undefined)}>
                <option value="">Dowolne</option>
                <option value="3.5">3.5+</option>
                <option value="4.0">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
          </div>

          <div>
            <span className="label">Biuro podróży</span>
            <MultiCheckbox options={PROVIDERS} selected={filter.providers ?? []} onChange={(v) => set('providers', v)} />
            <p className="text-xs text-slate-400 mt-1">(puste = wszystkie)</p>
          </div>
        </div>
      )}
    </form>
  );
}
