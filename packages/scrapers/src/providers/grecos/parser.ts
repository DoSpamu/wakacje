import type { Page } from 'playwright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { GRECOS_SELECTORS } from './config.js';

export function parseGrecosPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseGrecosStars(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? Math.min(5, parseInt(match[1]!, 10)) : 4;
}

export function parseGrecosNights(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 7;
}

export function parseGrecosBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ultra') || lower.includes('uai')) return 'ultra-all-inclusive';
  if (lower.includes('all') && lower.includes('inclusive')) return 'all-inclusive';
  if (lower.includes('half') || lower.includes('hb')) return 'half-board';
  if (lower.includes('full') || lower.includes('fb')) return 'full-board';
  if (lower.includes('bb') || lower.includes('breakfast')) return 'bed-and-breakfast';
  if (lower.includes('ro') || lower.includes('room only')) return 'room-only';
  return 'unknown';
}

export function parseGrecosDate(raw: string): string {
  // Grecos uses YYYYMMDD format in URL params but DD.MM.YYYY in display
  if (/^\d{8}$/.test(raw.trim())) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return raw.slice(0, 10);
  return new Date().toISOString().split('T')[0]!;
}

export function parseGrecosAirport(raw: string): string {
  const match = /([A-Z]{3})/.exec(raw);
  if (match) return match[1]!;
  if (raw.includes('Katowice')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('Krakow')) return 'KRK';
  return 'KTW';
}

export async function parseGrecosPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  // Try structured data first
  const structuredOffers = await parseGrecosStructuredData(page);
  if (structuredOffers.length > 0) {
    logger.debug(`Parsed ${structuredOffers.length} Grecos offers from structured data`, undefined, 'grecos');
    return structuredOffers;
  }

  // DOM fallback
  const cards = page.locator(GRECOS_SELECTORS.offerCard);
  const count = await cards.count();
  logger.debug(`Found ${count} Grecos offer cards (DOM)`, undefined, 'grecos');

  for (let i = 0; i < count; i++) {
    try {
      const card = cards.nth(i);
      const getText = async (sel: string) => {
        try { return (await card.locator(sel).first().innerText({ timeout: 3000 })).trim(); }
        catch { return ''; }
      };
      const getAttr = async (sel: string, attr: string) => {
        try { return (await card.locator(sel).first().getAttribute(attr)) ?? ''; }
        catch { return ''; }
      };

      const hotelName = await getText(GRECOS_SELECTORS.hotelName);
      if (!hotelName) continue;

      const depDate = parseGrecosDate(await getText(GRECOS_SELECTORS.departureDate));
      const nights = parseGrecosNights(await getText(GRECOS_SELECTORS.nights));
      const priceTotal = parseGrecosPrice(await getText(GRECOS_SELECTORS.priceTotal));
      if (!priceTotal || priceTotal < 100) continue;

      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      const href = await getAttr(GRECOS_SELECTORS.offerLink, 'href');
      const offerUrl = href
        ? href.startsWith('http') ? href : `https://www.grecos.pl${href}`
        : sourceUrl;

      offers.push({
        providerCode: 'grecos',
        hotelName,
        hotelStars: parseGrecosStars(await getText(GRECOS_SELECTORS.hotelStars)) as RawOffer['hotelStars'],
        hotelLocation: await getText(GRECOS_SELECTORS.hotelLocation),
        destinationRaw: await getText(GRECOS_SELECTORS.hotelLocation),
        departureAirport: parseGrecosAirport(await getText(GRECOS_SELECTORS.departureAirport)) || 'KTW',
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseGrecosBoardType(await getText(GRECOS_SELECTORS.boardType)),
        priceTotal,
        pricePerPerson: parseGrecosPrice(await getText(GRECOS_SELECTORS.pricePerPerson)) || Math.round(priceTotal / 2),
        currency: 'PLN',
        adults: 2,
        children: 0,
        sourceUrl: offerUrl,
      });
    } catch (err) {
      logger.warn(`Failed to parse Grecos card ${i}`, { error: String(err) }, 'grecos');
    }
  }

  return offers;
}

async function parseGrecosStructuredData(page: Page): Promise<RawOffer[]> {
  try {
    // Grecos may use window.__INITIAL_DATA__ or similar
    const windowData = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      return win.__INITIAL_DATA__ ?? win.__APP_STATE__ ?? win.appState ?? null;
    });

    if (!windowData) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = windowData as any;
    const offerList = data?.offers ?? data?.packages ?? data?.results ?? [];

    if (!Array.isArray(offerList)) return [];

    return offerList.map((raw: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      const depDate = parseGrecosDate(String(r.departureDate ?? r.date ?? ''));
      const nights = Number(r.nights ?? r.duration ?? 7);
      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      return {
        providerCode: 'grecos' as const,
        providerOfferId: String(r.id ?? ''),
        hotelName: String(r.hotelName ?? r.hotel?.name ?? ''),
        hotelStars: Math.min(5, Number(r.stars ?? 4)) as RawOffer['hotelStars'],
        hotelLocation: String(r.location ?? r.resort ?? ''),
        destinationRaw: String(r.country ?? r.destination ?? ''),
        departureAirport: parseGrecosAirport(String(r.departureAirport ?? '')),
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseGrecosBoardType(String(r.board ?? r.boardType ?? '')),
        priceTotal: Number(r.price ?? r.priceTotal ?? 0),
        pricePerPerson: Number(r.pricePerPerson ?? 0),
        currency: 'PLN',
        adults: Number(r.adults ?? 2),
        children: 0,
        sourceUrl: String(r.url ?? 'https://www.grecos.pl'),
        rawData: r as Record<string, unknown>,
      } satisfies RawOffer;
    }).filter((o: RawOffer) => o.hotelName && o.priceTotal > 0);
  } catch {
    return [];
  }
}
