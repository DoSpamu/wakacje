import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient();

  const { data: hotel, error } = await supabase
    .from('hotels')
    .select(`
      *,
      destinations (canonical_name, display_name, country_code),
      hotel_reviews_summary (*)
    `)
    .eq('id', params.id)
    .single();

  if (error || !hotel) {
    return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
  }

  // Get all offers for this hotel
  const { data: offers } = await supabase
    .from('offers_enriched')
    .select('*')
    .eq('hotel_id', params.id)
    .eq('is_available', true)
    .order('price_total', { ascending: true })
    .limit(50);

  return NextResponse.json({ hotel, offers: offers ?? [] });
}
