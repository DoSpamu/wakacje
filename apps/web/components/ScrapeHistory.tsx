'use client';

import type { ScrapeRunRow } from '@/lib/types';

const STATUS_STYLE: Record<string, string> = {
  completed: 'badge-green',
  running: 'badge-blue',
  partial: 'badge-amber',
  failed: 'badge-red',
  pending: 'badge bg-slate-100 text-slate-600',
};

const PROVIDER_STYLE: Record<string, string> = {
  rpl: 'badge-blue',
  exim: 'badge-green',
  coral: 'badge-amber',
  itaka: 'bg-purple-100 text-purple-700 badge',
  grecos: 'bg-sky-100 text-sky-700 badge',
  tui: 'bg-rose-100 text-rose-700 badge',
};

export default function ScrapeHistory({ runs }: { runs: ScrapeRunRow[] }) {
  if (runs.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-4xl mb-3">📋</div>
        <h3 className="font-semibold text-slate-700 mb-1">Brak uruchomień</h3>
        <p className="text-sm text-slate-500">
          Uruchom scraper, aby zobaczyć historię.
        </p>
        <p className="text-xs text-slate-400 mt-3">
          Komenda: <code className="bg-slate-100 px-1 py-0.5 rounded">pnpm scrape</code>
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="offers-table">
        <thead>
          <tr>
            <th>Czas</th>
            <th>Operator</th>
            <th>Status</th>
            <th className="text-right">Oferty</th>
            <th>Czas trwania</th>
            <th>Błąd</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="text-xs text-slate-500 whitespace-nowrap">
                {run.created_at
                  ? new Date(run.created_at).toLocaleString('pl-PL', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : '–'}
              </td>

              <td>
                <span className={PROVIDER_STYLE[run.provider_code] ?? 'badge bg-slate-100'}>
                  {run.provider_name}
                </span>
              </td>

              <td>
                <span className={STATUS_STYLE[run.status] ?? 'badge bg-slate-100'}>
                  {run.status}
                </span>
              </td>

              <td className="text-right font-medium text-slate-900">
                {run.offers_found.toLocaleString('pl-PL')}
              </td>

              <td className="text-sm text-slate-500">
                {run.duration_seconds !== null
                  ? `${Math.round(run.duration_seconds)}s`
                  : '–'}
              </td>

              <td className="max-w-[300px]">
                {run.error_message ? (
                  <span className="text-xs text-red-600 truncate block" title={run.error_message}>
                    {run.error_message}
                  </span>
                ) : (
                  <span className="text-slate-300 text-xs">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
