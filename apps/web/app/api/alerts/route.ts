import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateAlertSchema = z.object({
  email: z.string().email(),
  hotelId: z.string().uuid(),
  thresholdPrice: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { email, hotelId, thresholdPrice } = parsed.data;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('price_alerts')
    .upsert(
      { email, hotel_id: hotelId, threshold_price: thresholdPrice },
      { onConflict: 'email,hotel_id' },
    );

  if (error) {
    console.error('[/api/alerts] upsert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const email = sp.get('email');
  const hotelId = sp.get('hotelId');

  if (!email || !hotelId) {
    return NextResponse.json({ error: 'email and hotelId required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('price_alerts')
    .delete()
    .eq('email', email)
    .eq('hotel_id', hotelId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
