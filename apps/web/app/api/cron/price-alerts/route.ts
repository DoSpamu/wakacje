import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { Resend } from 'resend';

export const runtime = 'nodejs';

interface Alert {
  id: string;
  email: string;
  hotel_id: string;
  threshold_price: number;
  last_notified_price: number | null;
  // Supabase returns joined row as single object (not array) when using .select('hotels(...)')
  hotels: { canonical_name: string } | { canonical_name: string }[] | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createServerClient();

  // Fetch all alerts with hotel names
  const alertsResult = await supabase
    .from('price_alerts')
    .select('id, email, hotel_id, threshold_price, last_notified_price, hotels(canonical_name)')
    .limit(500);

  if (alertsResult.error) {
    return NextResponse.json({ error: alertsResult.error.message }, { status: 500 });
  }

  const alerts = (alertsResult.data ?? []) as unknown as Alert[];

  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  // Get current min prices for all hotels in one query
  const hotelIds = [...new Set(alerts.map((a) => a.hotel_id))];

  const { data: priceData } = await supabase
    .from('offers_enriched')
    .select('hotel_id, price_total')
    .in('hotel_id', hotelIds)
    .eq('is_available', true);

  // Aggregate min price per hotel
  const minPrices = new Map<string, number>();
  for (const row of priceData ?? []) {
    const hid = row.hotel_id as string;
    const price = row.price_total as number;
    const existing = minPrices.get(hid);
    if (!existing || price < existing) minPrices.set(hid, price);
  }

  let sent = 0;

  for (const alert of alerts) {
    const currentPrice = minPrices.get(alert.hotel_id);
    if (!currentPrice) continue;

    // Send if price is at or below threshold AND we haven't already notified at this price level
    const shouldNotify =
      currentPrice <= alert.threshold_price &&
      (alert.last_notified_price === null || currentPrice < alert.last_notified_price - 50);

    if (!shouldNotify) continue;

    const hotelsField = alert.hotels;
    const hotelName = (Array.isArray(hotelsField) ? hotelsField[0]?.canonical_name : hotelsField?.canonical_name) ?? 'hotel';

    try {
      await resend.emails.send({
        from: 'Wakacje Aggregator <alerty@wakacje.app>',
        to: alert.email,
        subject: `Cena spada! ${hotelName} — od ${currentPrice.toLocaleString('pl-PL')} zl`,
        html: `
          <h2>Cena w ${hotelName} spada!</h2>
          <p>Aktualna minimalna cena: <strong>${currentPrice.toLocaleString('pl-PL')} zl</strong></p>
          <p>Twoj prog alertu: ${alert.threshold_price.toLocaleString('pl-PL')} zl</p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://wakacje.app'}/hotels/${alert.hotel_id}"
               style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
              Zobacz oferty
            </a>
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
          <p style="font-size:12px;color:#94a3b8">
            Aby anulowac ten alert, odwiedz strone hotelu i kliknij "Anuluj alert".
          </p>
        `,
      });

      // Update last_notified_price so we don't spam
      await supabase
        .from('price_alerts')
        .update({ last_notified_price: currentPrice, last_notified_at: new Date().toISOString() })
        .eq('id', alert.id);

      sent++;
    } catch (err) {
      console.error('[cron/price-alerts] send error for', alert.email, err);
    }
  }

  return NextResponse.json({ ok: true, checked: alerts.length, sent });
}
