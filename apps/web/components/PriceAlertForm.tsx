'use client';

import { useState } from 'react';

interface Props {
  hotelId: string;
  hotelName: string;
  currentPrice: number;
}

export default function PriceAlertForm({ hotelId, hotelName, currentPrice }: Props) {
  const [email, setEmail] = useState('');
  const [threshold, setThreshold] = useState(Math.floor(currentPrice * 0.95 / 100) * 100);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, hotelId, thresholdPrice: threshold }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setStatus('ok');
        setMsg(`Alert ustawiony! Dostaniesz email gdy cena w ${hotelName} spadnie ponizej ${threshold.toLocaleString('pl-PL')} zl.`);
      } else {
        setStatus('error');
        setMsg(json.error ?? 'Blad');
      }
    } catch {
      setStatus('error');
      setMsg('Blad polaczenia');
    }
  };

  if (status === 'ok') {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
        {msg}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <span>🔔</span> Alert cenowy
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Powiadomimy Cie gdy cena spadnie ponizej progu. Teraz najtaniej:{' '}
        <span className="font-semibold text-slate-700">{currentPrice.toLocaleString('pl-PL')} zl</span>
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label className="label">Twoj email</label>
          <input
            type="email"
            required
            className="input"
            placeholder="jan@przykład.pl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Prog cenowy (PLN lacznie)</label>
          <input
            type="number"
            required
            step={100}
            min={500}
            className="input"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
          />
          <p className="text-xs text-slate-400 mt-1">
            {threshold < currentPrice
              ? `Powiadomimy gdy cena spadnie o ${(currentPrice - threshold).toLocaleString('pl-PL')} zl`
              : 'Prog wyzszy niz aktualna cena — dostaniesz powiadomienie od razu przy nastepnym sprawdzeniu'}
          </p>
        </div>
        {status === 'error' && (
          <p className="text-xs text-red-600">{msg}</p>
        )}
        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn-primary text-sm w-full"
        >
          {status === 'loading' ? 'Zapisywanie...' : 'Ustaw alert'}
        </button>
      </form>
    </div>
  );
}
