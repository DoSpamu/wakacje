import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export interface DestinationSummary {
  destination: string;
  label: string;
  lat: number;
  lng: number;
  minPrice: number;
  hotelCount: number;
  offerCount: number;
}

const DESTINATION_META: Record<string, { label: string; lat: number; lng: number }> = {
  turkey:         { label: 'Turcja',             lat: 37.0,  lng: 35.3  },
  egypt:          { label: 'Egipt',              lat: 27.2,  lng: 33.8  },
  greece:         { label: 'Grecja',             lat: 37.9,  lng: 23.7  },
  spain:          { label: 'Hiszpania',          lat: 40.4,  lng: -3.7  },
  cyprus:         { label: 'Cypr',               lat: 34.9,  lng: 33.0  },
  tunisia:        { label: 'Tunezja',            lat: 33.9,  lng: 9.6   },
  bulgaria:       { label: 'Bulgaria',           lat: 42.7,  lng: 27.7  },
  croatia:        { label: 'Chorwacja',          lat: 43.5,  lng: 16.4  },
  malta:          { label: 'Malta',              lat: 35.9,  lng: 14.5  },
  'canary-islands': { label: 'Wyspy Kanaryjskie', lat: 28.1, lng: -15.4 },
  portugal:       { label: 'Portugalia',         lat: 38.7,  lng: -9.1  },
  morocco:        { label: 'Maroko',             lat: 31.8,  lng: -7.1  },
  albania:        { label: 'Albania',            lat: 41.1,  lng: 20.2  },
  montenegro:     { label: 'Czarnogora',         lat: 42.7,  lng: 19.4  },
};

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('offers_enriched')
    .select('destination_canonical, price_total, hotel_id')
    .eq('is_available', true)
    .not('destination_canonical', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate per destination in JS (PostgREST lacks GROUP BY)
  const byDest = new Map<string, { minPrice: number; hotelIds: Set<string>; offerCount: number }>();

  for (const row of data ?? []) {
    const dest = row.destination_canonical as string;
    if (!DESTINATION_META[dest]) continue;

    const price = row.price_total as number;
    const existing = byDest.get(dest);
    if (!existing) {
      byDest.set(dest, { minPrice: price, hotelIds: new Set([row.hotel_id]), offerCount: 1 });
    } else {
      if (price < existing.minPrice) existing.minPrice = price;
      existing.hotelIds.add(row.hotel_id);
      existing.offerCount++;
    }
  }

  const result: DestinationSummary[] = [];
  for (const [dest, stats] of byDest.entries()) {
    const meta = DESTINATION_META[dest]!;
    result.push({
      destination: dest,
      label: meta.label,
      lat: meta.lat,
      lng: meta.lng,
      minPrice: stats.minPrice,
      hotelCount: stats.hotelIds.size,
      offerCount: stats.offerCount,
    });
  }

  result.sort((a, b) => a.minPrice - b.minPrice);

  return NextResponse.json(result);
}
