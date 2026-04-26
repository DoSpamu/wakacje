import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const page = parseInt(sp.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(sp.get('pageSize') ?? '50', 10), 200);

  const supabase = createServerClient();

  let query = supabase
    .from('offers_enriched')
    .select('*', { count: 'exact' })
    .eq('is_available', true);

  // Direct ID lookup (used by compare page)
  const ids = sp.get('ids')?.split(',').filter(Boolean);
  if (ids?.length) {
    query = query.in('id', ids);
  }

  // Destination filter
  const destinations = sp.get('destinations')?.split(',').filter(Boolean);
  if (destinations?.length) query = query.in('destination_canonical', destinations);

  // Airport filter
  const airports = sp.get('airports')?.split(',').filter(Boolean);
  if (airports?.length) query = query.in('departure_airport', airports);

  // Date range
  const dateFrom = sp.get('dateFrom');
  const dateTo = sp.get('dateTo');
  if (dateFrom) query = query.gte('departure_date', dateFrom);
  if (dateTo) query = query.lte('departure_date', dateTo);

  // Nights
  const nightsMin = sp.get('nightsMin');
  const nightsMax = sp.get('nightsMax');
  if (nightsMin && parseInt(nightsMin, 10) > 1) query = query.gte('nights', parseInt(nightsMin, 10));
  if (nightsMax && parseInt(nightsMax, 10) < 30) query = query.lte('nights', parseInt(nightsMax, 10));

  // Adults
  const adults = sp.get('adults');
  if (adults) query = query.eq('adults', parseInt(adults, 10));

  // Stars
  const stars = sp.get('stars')?.split(',').map(Number).filter(Boolean);
  if (stars?.length) query = query.in('hotel_stars', stars);

  // Board types
  const boardTypes = sp.get('boardTypes')?.split(',').filter(Boolean);
  if (boardTypes?.length) query = query.in('board_type', boardTypes);

  // Price
  const priceMin = sp.get('priceMin');
  if (priceMin) query = query.gte('price_total', parseInt(priceMin, 10));
  const priceMax = sp.get('priceMax');
  if (priceMax) query = query.lte('price_total', parseInt(priceMax, 10));

  // Providers
  const providers = sp.get('providers')?.split(',').filter(Boolean);
  if (providers?.length) query = query.in('provider_code', providers);

  // Review score filters
  const minTaRating = sp.get('minTaRating');
  if (minTaRating) query = query.gte('tripadvisor_rating', parseFloat(minTaRating));
  const minFoodScore = sp.get('minFoodScore');
  if (minFoodScore) query = query.gte('tripadvisor_food_score', parseFloat(minFoodScore));

  // Sorting
  const sortBy = sp.get('sortBy') ?? 'composite_score';
  const sortOrder = sp.get('sortOrder') ?? 'desc';

  const VALID_SORT_COLUMNS = [
    'composite_score', 'price_total', 'price_per_person',
    'hotel_stars', 'departure_date', 'nights',
    'tripadvisor_rating', 'tripadvisor_food_score',
    'hotel_name',
  ];

  if (VALID_SORT_COLUMNS.includes(sortBy)) {
    query = query.order(sortBy, {
      ascending: sortOrder === 'asc',
      nullsFirst: false,
    });
  }

  // Secondary sort
  if (sortBy !== 'price_total') {
    query = query.order('price_total', { ascending: true });
  }

  // Pagination
  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[/api/offers]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    pages: Math.ceil((count ?? 0) / pageSize),
  });
}
