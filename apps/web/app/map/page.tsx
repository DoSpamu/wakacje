import dynamic from 'next/dynamic';
import { createServerClient } from '@/lib/supabase';
import type { DestinationSummary } from '@/app/api/map/route';

// SSR must be disabled — Leaflet uses window/document at module load time
const DestinationMap = dynamic(() => import('@/components/DestinationMap'), { ssr: false });

const DESTINATION_META: Record<string, { label: string; lat: number; lng: number }> = {
  turkey:           { label: 'Turcja',             lat: 37.0,  lng: 35.3  },
  egypt:            { label: 'Egipt',              lat: 27.2,  lng: 33.8  },
  greece:           { label: 'Grecja',             lat: 37.9,  lng: 23.7  },
  spain:            { label: 'Hiszpania',          lat: 40.4,  lng: -3.7  },
  cyprus:           { label: 'Cypr',               lat: 34.9,  lng: 33.0  },
  tunisia:          { label: 'Tunezja',            lat: 33.9,  lng: 9.6   },
  bulgaria:         { label: 'Bulgaria',           lat: 42.7,  lng: 27.7  },
  croatia:          { label: 'Chorwacja',          lat: 43.5,  lng: 16.4  },
  malta:            { label: 'Malta',              lat: 35.9,  lng: 14.5  },
  'canary-islands': { label: 'Wyspy Kanaryjskie',  lat: 28.1,  lng: -15.4 },
  portugal:         { label: 'Portugalia',         lat: 38.7,  lng: -9.1  },
  morocco:          { label: 'Maroko',             lat: 31.8,  lng: -7.1  },
  albania:          { label: 'Albania',            lat: 41.1,  lng: 20.2  },
  montenegro:       { label: 'Czarnogora',         lat: 42.7,  lng: 19.4  },
};

async function getDestinations(): Promise<DestinationSummary[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('offers_enriched')
    .select('destination_canonical, price_total, hotel_id')
    .eq('is_available', true)
    .not('destination_canonical', 'is', null);

  if (error || !data) return [];

  const byDest = new Map<string, { minPrice: number; hotelIds: Set<string>; offerCount: number }>();

  for (const row of data) {
    const dest = row.destination_canonical as string;
    if (!DESTINATION_META[dest]) continue;
    const price = row.price_total as number;
    const existing = byDest.get(dest);
    if (!existing) {
      byDest.set(dest, { minPrice: price, hotelIds: new Set([String(row.hotel_id)]), offerCount: 1 });
    } else {
      if (price < existing.minPrice) existing.minPrice = price;
      existing.hotelIds.add(String(row.hotel_id));
      existing.offerCount++;
    }
  }

  return [...byDest.entries()]
    .map(([dest, stats]) => {
      const meta = DESTINATION_META[dest]!;
      return {
        destination: dest,
        label: meta.label,
        lat: meta.lat,
        lng: meta.lng,
        minPrice: stats.minPrice,
        hotelCount: stats.hotelIds.size,
        offerCount: stats.offerCount,
      };
    })
    .sort((a, b) => a.minPrice - b.minPrice);
}

export default async function MapPage() {
  const destinations = await getDestinations();
  const cheapest = destinations[0];
  const totalOffers = destinations.reduce((s, d) => s + d.offerCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mapa kierunkow</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {destinations.length} kierunkow &bull; {totalOffers.toLocaleString('pl-PL')} ofert
            {cheapest && (
              <> &bull; najtaniej: <span className="text-green-700 font-semibold">{cheapest.label}</span> od {cheapest.minPrice.toLocaleString('pl-PL')} zl</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> najtansze
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span> srednie
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> drogie
          </span>
        </div>
      </div>

      <div className="card overflow-hidden" style={{ height: '600px' }}>
        {destinations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Brak danych
          </div>
        ) : (
          <DestinationMap destinations={destinations} />
        )}
      </div>

      {/* Summary table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Kierunek</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Od</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Hotele</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Oferty</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {destinations.map((d) => (
              <tr key={d.destination} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-800">{d.label}</td>
                <td className="px-4 py-2 text-right font-semibold text-green-700">
                  {d.minPrice.toLocaleString('pl-PL')} zl
                </td>
                <td className="px-4 py-2 text-right text-slate-600">{d.hotelCount}</td>
                <td className="px-4 py-2 text-right text-slate-500">{d.offerCount}</td>
                <td className="px-4 py-2 text-right">
                  <a
                    href={`/?destinations=${d.destination}`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Pokaz &rarr;
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
