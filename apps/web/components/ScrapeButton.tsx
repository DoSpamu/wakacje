'use client';

import { useState, useTransition } from 'react';
import { triggerScrape } from '@/app/actions/scrape';

export default function ScrapeButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; workflow?: string } | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const res = await triggerScrape('all');
      setResult(res);
      if (res.ok) setTimeout(() => setResult(null), 10_000);
    });
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending && (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
        {isPending ? 'Uruchamianie...' : 'Odśwież oferty'}
      </button>

      {result && (
        <span className={`text-sm ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
          {result.message}
          {result.workflow && (
            <>
              {' '}
              <a
                href={result.workflow}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Zobacz postęp
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}
