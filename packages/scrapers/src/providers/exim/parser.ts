import type { Page, Locator } from 'patchright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { EXIM_SELECTORS } from './config.js';

export function parseEximPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseEximStars(raw: string): number {
  // Stars may be shown as filled stars icons or numeric
  const match = /(\d+)/.exec(raw);
  if (match) return Math.min(5, parseInt(match[1]!, 10));
  // Count star icons
  const starIcons = (raw.match(/★|☆|\*/g) ?? []).length;
  return starIcons > 0 ? Math.min(5, starIcons) : 4;
}

export function parseEximNights(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 7;
}

export function parseEximBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ultra all') || lower.includes('uai') || lower.includes('ultra-all')) return 'ultra-all-inclusive';
  if (lower.includes('all inclusive') || lower.includes('all-inclusive') || lower.includes('ai')) return 'all-inclusive';
  if (lower.includes('half') || lower.includes('hb') || lower.includes('śniadanie + kolacja')) return 'half-board';
  if (lower.includes('full') || lower.includes('fb') || lower.includes('pełne wyżywienie')) return 'full-board';
  if (lower.includes('bb') || lower.includes('breakfast') || lower.includes('śniadanie')) return 'bed-and-breakfast';
  if (lower.includes('ro') || lower.includes('room only') || lower.includes('bez wyżywienia')) return 'room-only';
  return 'unknown';
}

export function parseEximDate(raw: string): string {
  // DD.MM.YYYY
  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  // YYYY-MM-DD
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return raw.slice(0, 10);

  return new Date().toISOString().split('T')[0]!;
}

export function parseEximAirport(raw: string): string {
  const match = /\(([A-Z]{3})\)/.exec(raw);
  if (match) return match[1]!;
  if (raw.includes('Katowice') || raw.includes('KTW')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('KRK')) return 'KRK';
  if (raw.includes('Warszawa') || raw.includes('WAW')) return 'WAW';
  return 'KTW';
}

/** Try to extract offer data from Exim API response intercepted by Playwright */
export function parseEximApiResponse(json: unknown): RawOffer[] {
  const offers: RawOffer[] = [];

  if (!json || typeof json !== 'object') return offers;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = json as any;

  // Exim API likely returns { offers: [], total: N } or similar
  const offerList = data?.offers ?? data?.data?.offers ?? data?.results ?? [];

  if (!Array.isArray(offerList)) return offers;

  for (const raw of offerList) {
    try {
      const departureDate = parseEximDate(String(raw.departureDate ?? raw.date_from ?? ''));
      const nights = Number(raw.nights ?? raw.duration ?? 7);

      const departureDateObj = new Date(departureDate);
      const returnDateObj = new Date(departureDateObj);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      const offer: RawOffer = {
        providerCode: 'exim',
        providerOfferId: String(raw.id ?? raw.offerId ?? ''),
        hotelName: String(raw.hotelName ?? raw.hotel?.name ?? raw.name ?? ''),
        hotelStars: Math.min(5, Math.max(1, Number(raw.stars ?? raw.hotelCategory ?? 4))) as RawOffer['hotelStars'],
        hotelLocation: String(raw.location ?? raw.resort ?? raw.region ?? ''),
        destinationRaw: String(raw.country ?? raw.destination ?? raw.destinationName ?? ''),
        departureAirport: String(raw.departureAirport ?? raw.airport ?? 'KTW'),
        departureDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseEximBoardType(String(raw.boardType ?? raw.board ?? raw.feeding ?? '')),
        priceTotal: Number(raw.priceTotal ?? raw.price ?? raw.totalPrice ?? 0),
        pricePerPerson: Number(raw.pricePerPerson ?? raw.personPrice ?? 0),
        currency: String(raw.currency ?? 'PLN'),
        adults: Number(raw.adults ?? 2),
        children: Number(raw.children ?? 0),
        sourceUrl: String(raw.offerUrl ?? raw.url ?? 'https://www.exim.pl'),
        rawData: raw as Record<string, unknown>,
      };

      if (offer.hotelName && offer.priceTotal > 0) {
        offers.push(offer);
      }
    } catch {
      // skip malformed
    }
  }

  return offers;
}

/** Parse offers from DOM as fallback */
export async function parseEximPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  const cards = page.locator(EXIM_SELECTORS.offerCard);
  const count = await cards.count();

  logger.debug(`Found ${count} Exim offer cards`, undefined, 'exim');

  for (let i = 0; i < count; i++) {
    try {
      const card = cards.nth(i);
      const offer = await parseEximCard(card, sourceUrl);
      if (offer) offers.push(offer);
    } catch (err) {
      logger.warn(`Failed to parse Exim card ${i}`, { error: String(err) }, 'exim');
    }
  }

  return offers;
}

async function parseEximCard(card: Locator, sourceUrl: string): Promise<RawOffer | null> {
  const getText = async (selector: string): Promise<string> => {
    try {
      return (await card.locator(selector).first().innerText({ timeout: 3000 })).trim();
    } catch {
      return '';
    }
  };

  const getAttr = async (selector: string, attr: string): Promise<string> => {
    try {
      return (await card.locator(selector).first().getAttribute(attr)) ?? '';
    } catch {
      return '';
    }
  };

  const hotelName = await getText(EXIM_SELECTORS.hotelName);
  if (!hotelName) return null;

  const starsText = await getText(EXIM_SELECTORS.hotelStars);
  const locationText = await getText(EXIM_SELECTORS.hotelLocation);
  const departureDateText = await getText(EXIM_SELECTORS.departureDate);
  const nightsText = await getText(EXIM_SELECTORS.nights);
  const boardText = await getText(EXIM_SELECTORS.boardType);
  const priceTotalText = await getText(EXIM_SELECTORS.priceTotal);
  const pricePerPersonText = await getText(EXIM_SELECTORS.pricePerPerson);
  const airportText = await getText(EXIM_SELECTORS.departureAirport);

  const href = await getAttr(EXIM_SELECTORS.offerLink, 'href');
  const offerUrl = href
    ? href.startsWith('http') ? href : `https://www.exim.pl${href}`
    : sourceUrl;

  const departureDate = parseEximDate(departureDateText);
  const nights = parseEximNights(nightsText) || 7;
  const priceTotal = parseEximPrice(priceTotalText);

  if (!priceTotal || priceTotal < 100) return null;

  const returnDateObj = new Date(departureDate);
  returnDateObj.setDate(returnDateObj.getDate() + nights);

  return {
    providerCode: 'exim',
    hotelName,
    hotelStars: parseEximStars(starsText) as RawOffer['hotelStars'],
    hotelLocation: locationText || 'Nieznana lokalizacja',
    destinationRaw: locationText,
    departureAirport: parseEximAirport(airportText) || 'KTW',
    departureDate,
    returnDate: returnDateObj.toISOString().split('T')[0]!,
    nights,
    boardType: parseEximBoardType(boardText),
    priceTotal,
    pricePerPerson: parseEximPrice(pricePerPersonText) || Math.round(priceTotal / 2),
    currency: 'PLN',
    adults: 2,
    children: 0,
    sourceUrl: offerUrl,
  };
}
