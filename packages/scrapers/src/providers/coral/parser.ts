import type { Page } from 'playwright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { CORAL_SELECTORS } from './config.js';

export function parseCoralPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseCoralStars(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? Math.min(5, parseInt(match[1]!, 10)) : 4;
}

export function parseCoralNights(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 7;
}

export function parseCoralBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ultra') || lower.includes('uai')) return 'ultra-all-inclusive';
  if (lower.includes('all') && lower.includes('inclusive')) return 'all-inclusive';
  if (lower.includes('half') || lower.includes('hb')) return 'half-board';
  if (lower.includes('full') || lower.includes('fb')) return 'full-board';
  if (lower.includes('bb') || lower.includes('breakfast')) return 'bed-and-breakfast';
  if (lower.includes('ro') || lower.includes('room only')) return 'room-only';
  return 'unknown';
}

export function parseCoralDate(raw: string): string {
  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return raw.slice(0, 10);
  return new Date().toISOString().split('T')[0]!;
}

/**
 * Parse Coral Travel API JSON response (if intercepted).
 * TODO: Inspect actual Coral Travel API response structure and update mappings.
 */
export function parseCoralApiResponse(json: unknown): RawOffer[] {
  const offers: RawOffer[] = [];
  if (!json || typeof json !== 'object') return offers;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = json as any;
  const offerList = data?.offers ?? data?.results ?? data?.data ?? [];

  if (!Array.isArray(offerList)) return offers;

  for (const raw of offerList) {
    try {
      const departureDate = parseCoralDate(String(raw.departureDate ?? raw.date ?? ''));
      const nights = Number(raw.nights ?? raw.duration ?? 7);
      const returnDateObj = new Date(departureDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      const offer: RawOffer = {
        providerCode: 'coral',
        providerOfferId: String(raw.id ?? ''),
        hotelName: String(raw.hotelName ?? raw.name ?? ''),
        hotelStars: Math.min(5, Number(raw.stars ?? 4)) as RawOffer['hotelStars'],
        hotelLocation: String(raw.location ?? raw.resort ?? ''),
        destinationRaw: String(raw.country ?? raw.destination ?? ''),
        departureAirport: String(raw.departureAirport ?? 'KTW'),
        departureDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseCoralBoardType(String(raw.board ?? raw.boardType ?? '')),
        priceTotal: Number(raw.price ?? raw.totalPrice ?? 0),
        pricePerPerson: Number(raw.pricePerPerson ?? 0),
        currency: 'PLN',
        adults: Number(raw.adults ?? 2),
        children: Number(raw.children ?? 0),
        sourceUrl: String(raw.url ?? 'https://www.coraltravel.pl'),
        rawData: raw as Record<string, unknown>,
      };

      if (offer.hotelName && offer.priceTotal > 0) offers.push(offer);
    } catch {
      // skip
    }
  }

  return offers;
}

export async function parseCoralPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];
  const cards = page.locator(CORAL_SELECTORS.offerCard);
  const count = await cards.count();

  logger.debug(`Found ${count} Coral offer cards`, undefined, 'coral');

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

      const hotelName = await getText(CORAL_SELECTORS.hotelName);
      if (!hotelName) continue;

      const stars = parseCoralStars(await getText(CORAL_SELECTORS.hotelStars));
      const location = await getText(CORAL_SELECTORS.hotelLocation);
      const depDate = parseCoralDate(await getText(CORAL_SELECTORS.departureDate));
      const nights = parseCoralNights(await getText(CORAL_SELECTORS.nights));
      const board = parseCoralBoardType(await getText(CORAL_SELECTORS.boardType));
      const priceTotal = parseCoralPrice(await getText(CORAL_SELECTORS.priceTotal));
      const pricePerPerson = parseCoralPrice(await getText(CORAL_SELECTORS.pricePerPerson));
      const airport = await getText(CORAL_SELECTORS.departureAirport);

      const href = await getAttr(CORAL_SELECTORS.offerLink, 'href');
      const offerUrl = href
        ? href.startsWith('http') ? href : `https://www.coraltravel.pl${href}`
        : sourceUrl;

      if (!priceTotal || priceTotal < 100) continue;

      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      offers.push({
        providerCode: 'coral',
        hotelName,
        hotelStars: stars as RawOffer['hotelStars'],
        hotelLocation: location,
        destinationRaw: location,
        departureAirport: airport || 'KTW',
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: board,
        priceTotal,
        pricePerPerson: pricePerPerson || Math.round(priceTotal / 2),
        currency: 'PLN',
        adults: 2,
        children: 0,
        sourceUrl: offerUrl,
      });
    } catch (err) {
      logger.warn(`Failed to parse Coral card ${i}`, { error: String(err) }, 'coral');
    }
  }

  return offers;
}
