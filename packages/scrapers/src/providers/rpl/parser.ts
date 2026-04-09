/**
 * R.pl offer parser.
 * Isolated from scraper logic — can be unit-tested independently.
 *
 * Input: Playwright ElementHandle for a single offer card
 * Output: Partial<RawOffer> or null if parsing fails
 */

import type { Page, Locator } from 'playwright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { RPL_SELECTORS } from './config.js';

/** Parse a numeric price string like "3 299 PLN" → 3299 */
export function parseRplPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

/** Parse stars from data-rating attribute value ("4", "5") or text fallback */
export function parseRplStars(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  if (n >= 1 && n <= 5) return n;
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 4;
}

/**
 * Parse nights from "04.09.2026 (8 dni / 7 noclegów)" → 7
 * The number before "noclegów" is nights; before "dni" is days.
 */
export function parseRplNights(raw: string): number {
  const nocy = /(\d+)\s*noclegi?ów?/i.exec(raw);
  if (nocy) return parseInt(nocy[1]!, 10);
  const dni = /(\d+)\s*dni/i.exec(raw);
  if (dni) return parseInt(dni[1]!, 10) - 1; // days - 1 = nights
  const plain = /(\d+)/.exec(raw);
  return plain ? parseInt(plain[1]!, 10) : 7;
}

/** Normalize board type string from r.pl to canonical BoardType */
export function parseRplBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ultra') || lower.includes('ultra all')) return 'ultra-all-inclusive';
  if (lower.includes('all inclusive') || lower.includes('all-inclusive')) return 'all-inclusive';
  if (lower.includes('half') || lower.includes('hb') || lower.includes('połówka')) return 'half-board';
  if (lower.includes('full') || lower.includes('fb') || lower.includes('pełne')) return 'full-board';
  if (lower.includes('breakfast') || lower.includes('śniadanie') || lower.includes('bb')) return 'bed-and-breakfast';
  if (lower.includes('room only') || lower.includes('bez wyżywienia') || lower.includes('ro')) return 'room-only';
  return 'unknown';
}

/** Parse departure airport from city name "Katowice" or code "KTW" → "KTW" */
export function parseRplAirport(raw: string): string {
  const iata = /\b([A-Z]{3})\b/.exec(raw);
  if (iata) return iata[1]!;
  const lower = raw.toLowerCase();
  if (lower.includes('katowice') || lower.includes('ktw') || lower.includes('pyrzowice')) return 'KTW';
  if (lower.includes('kraków') || lower.includes('krakow') || lower.includes('krk') || lower.includes('balice')) return 'KRK';
  if (lower.includes('warszawa') || lower.includes('warsaw') || lower.includes('waw') || lower.includes('chopin') || lower.includes('modlin')) return 'WAW';
  if (lower.includes('wrocław') || lower.includes('wroclaw') || lower.includes('wroc') || lower.includes('wro')) return 'WRO';
  if (lower.includes('gdańsk') || lower.includes('gdansk') || lower.includes('gdn')) return 'GDN';
  if (lower.includes('poznań') || lower.includes('poznan') || lower.includes('poz')) return 'POZ';
  return raw.replace(/\s*\(.*\)/, '').toUpperCase().trim().slice(0, 3) || 'KTW';
}

/** Parse date from various r.pl date formats → YYYY-MM-DD */
export function parseRplDate(raw: string): string {
  // Handle "09.06.2026" (DD.MM.YYYY)
  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  // Handle "2026-06-09"
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoMatch) return raw.slice(0, 10);

  // Handle "9 cze 2026" or "09 czerw. 2026"
  const monthNames: Record<string, string> = {
    sty: '01', jan: '01',
    lut: '02', feb: '02',
    mar: '03',
    kwi: '04', apr: '04',
    maj: '05', may: '05',
    cze: '06', jun: '06',
    lip: '07', jul: '07',
    sie: '08', aug: '08',
    wrz: '09', sep: '09',
    paź: '10', paz: '10', oct: '10',
    lis: '11', nov: '11',
    gru: '12', dec: '12',
  };

  const named = /(\d{1,2})\s+([a-ząćęłńóśźż]{3})[a-ząćęłńóśźż.]*\s+(\d{4})/i.exec(raw);
  if (named) {
    const monthKey = named[2]!.toLowerCase();
    const month = monthNames[monthKey] ?? '01';
    return `${named[3]}-${month}-${named[1]!.padStart(2, '0')}`;
  }

  return new Date().toISOString().split('T')[0]!;
}

/**
 * Parse all offer cards from the current page.
 * Returns array of RawOffer objects.
 */
export async function parseRplPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  // Try to get offer data from structured JSON-LD if available
  const jsonLdOffers = await parseJsonLd(page);
  if (jsonLdOffers.length > 0) {
    logger.debug(`Parsed ${jsonLdOffers.length} offers from JSON-LD`, undefined, 'rpl');
    return jsonLdOffers;
  }

  // Fall back to DOM parsing
  const cards = page.locator(RPL_SELECTORS.offerCard);
  const count = await cards.count();

  logger.debug(`Found ${count} offer cards on page`, undefined, 'rpl');

  for (let i = 0; i < count; i++) {
    try {
      const card = cards.nth(i);
      const offer = await parseRplCard(card, sourceUrl);
      if (offer) offers.push(offer);
    } catch (err) {
      logger.warn(`Failed to parse card ${i}`, { error: String(err) }, 'rpl');
    }
  }

  return offers;
}

async function parseRplCard(card: Locator, sourceUrl: string): Promise<RawOffer | null> {
  try {
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

    const hotelName = await getText(RPL_SELECTORS.hotelName);
    if (!hotelName) return null;

    // Stars: r.pl stores rating in data-rating attribute on .r-gwiazdki
    const starsRating = await getAttr(RPL_SELECTORS.hotelStars, 'data-rating');
    const starsText = starsRating || await getText(RPL_SELECTORS.hotelStars);

    const locationText = await getText(RPL_SELECTORS.hotelLocation);
    // "04.09.2026 (8 dni / 7 noclegów)" — date and nights in same element
    const dateNightsText = await getText(RPL_SELECTORS.departureDate);
    const boardText = await getText(RPL_SELECTORS.boardType);
    const pricePerPersonText = await getText(RPL_SELECTORS.pricePerPerson);
    const airportText = await getText(RPL_SELECTORS.departureAirport);

    // Card itself is an <a> element — get href directly
    const href = (await card.getAttribute('href')) ?? await getAttr(RPL_SELECTORS.offerLink, 'href');
    const offerUrl = href
      ? href.startsWith('http') ? href : `https://r.pl${href}`
      : sourceUrl;

    const departureDate = parseRplDate(dateNightsText);
    const nights = parseRplNights(dateNightsText) || 7;
    const adults = 2;
    const pricePerPerson = parseRplPrice(pricePerPersonText);

    if (!pricePerPerson || pricePerPerson < 100) return null;

    // r.pl shows price per person; multiply for total
    const priceTotal = Math.round(pricePerPerson * adults);

    const departureDateObj = new Date(departureDate);
    const returnDateObj = new Date(departureDateObj);
    returnDateObj.setDate(returnDateObj.getDate() + nights);

    const offer: RawOffer = {
      providerCode: 'rpl',
      hotelName,
      hotelStars: parseRplStars(starsText) as RawOffer['hotelStars'],
      hotelLocation: locationText || 'Nieznana lokalizacja',
      destinationRaw: locationText,
      departureAirport: parseRplAirport(airportText) || 'KTW',
      departureDate,
      returnDate: returnDateObj.toISOString().split('T')[0]!,
      nights,
      boardType: parseRplBoardType(boardText),
      priceTotal,
      pricePerPerson,
      currency: 'PLN',
      adults,
      children: 0,
      sourceUrl: offerUrl,
    };

    return offer;
  } catch (err) {
    logger.warn('parseRplCard error', { error: String(err) }, 'rpl');
    return null;
  }
}

/** Try to extract offers from structured data (JSON-LD) — faster and more reliable */
async function parseJsonLd(page: Page): Promise<RawOffer[]> {
  try {
    const jsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const results: unknown[] = [];
      scripts.forEach((s) => {
        try {
          results.push(JSON.parse(s.textContent ?? ''));
        } catch {
          // ignore
        }
      });
      return results;
    });

    // Also check for __NEXT_DATA__ or window.__INITIAL_STATE__
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el?.textContent) {
        try {
          return JSON.parse(el.textContent);
        } catch {
          return null;
        }
      }
      return null;
    });

    if (nextData) {
      return extractFromNextData(nextData);
    }

    return [];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromNextData(data: any): RawOffer[] {
  // Try to find offers in common Next.js state shapes
  const offers: RawOffer[] = [];

  try {
    // Attempt to find a list of offers in the state tree
    // This is heuristic — adjust based on actual r.pl response structure
    const props = data?.props?.pageProps;
    const offerList = props?.offers ?? props?.results ?? props?.data?.offers ?? [];

    if (!Array.isArray(offerList)) return offers;

    for (const raw of offerList) {
      try {
        const offer: RawOffer = {
          providerCode: 'rpl',
          providerOfferId: String(raw.id ?? raw.offerId ?? ''),
          hotelName: String(raw.hotelName ?? raw.hotel?.name ?? ''),
          hotelStars: Number(raw.stars ?? raw.hotel?.stars ?? 4) as RawOffer['hotelStars'],
          hotelLocation: String(raw.location ?? raw.destination ?? ''),
          destinationRaw: String(raw.destination ?? raw.country ?? ''),
          departureAirport: String(raw.departureAirport ?? raw.airport ?? 'KTW'),
          departureDate: String(raw.departureDate ?? raw.departure ?? ''),
          returnDate: String(raw.returnDate ?? raw.return ?? ''),
          nights: Number(raw.nights ?? raw.duration ?? 7),
          boardType: parseRplBoardType(String(raw.board ?? raw.boardType ?? '')),
          priceTotal: Number(raw.priceTotal ?? raw.price?.total ?? 0),
          pricePerPerson: Number(raw.pricePerPerson ?? raw.price?.perPerson ?? 0),
          currency: String(raw.currency ?? 'PLN'),
          adults: Number(raw.adults ?? 2),
          children: Number(raw.children ?? 0),
          sourceUrl: String(raw.url ?? raw.offerUrl ?? ''),
        };

        if (offer.hotelName && offer.priceTotal > 0) {
          offers.push(offer);
        }
      } catch {
        // skip malformed offer
      }
    }
  } catch {
    // not parseable
  }

  return offers;
}
