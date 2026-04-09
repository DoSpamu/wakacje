import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateXlsx, generateCsv } from '@/lib/export';
import type { OfferRow } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'

  // Use same filter params as /api/offers
  const supabase = createServerClient();

  let query = supabase
    .from('offers_enriched')
    .select('*')
    .eq('is_available', true);

  // Apply filters (same logic as /api/offers)
  const destinations = sp.get('destinations')?.split(',').filter(Boolean);
  if (destinations?.length) query = query.in('destination_canonical', destinations);

  const airports = sp.get('airports')?.split(',').filter(Boolean);
  if (airports?.length) query = query.in('departure_airport', airports);

  const dateFrom = sp.get('dateFrom');
  const dateTo = sp.get('dateTo');
  if (dateFrom) query = query.gte('departure_date', dateFrom);
  if (dateTo) query = query.lte('departure_date', dateTo);

  const nightsMin = sp.get('nightsMin');
  const nightsMax = sp.get('nightsMax');
  if (nightsMin) query = query.gte('nights', parseInt(nightsMin, 10));
  if (nightsMax) query = query.lte('nights', parseInt(nightsMax, 10));

  const stars = sp.get('stars')?.split(',').map(Number).filter(Boolean);
  if (stars?.length) query = query.in('hotel_stars', stars);

  const boardTypes = sp.get('boardTypes')?.split(',').filter(Boolean);
  if (boardTypes?.length) query = query.in('board_type', boardTypes);

  const priceMax = sp.get('priceMax');
  if (priceMax) query = query.lte('price_total', parseInt(priceMax, 10));

  const providers = sp.get('providers')?.split(',').filter(Boolean);
  if (providers?.length) query = query.in('provider_code', providers);

  // Limit exports to 2000 rows
  query = query
    .order('composite_score', { ascending: false, nullsFirst: false })
    .limit(2000);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const offers = (data ?? []) as OfferRow[];
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const csv = generateCsv(offers);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="wakacje-oferty-${timestamp}.csv"`,
      },
    });
  }

  // Default: XLSX
  const buffer = await generateXlsx(offers);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wakacje-oferty-${timestamp}.xlsx"`,
    },
  });
}
