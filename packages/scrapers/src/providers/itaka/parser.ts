import type { Page } from 'patchright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { ITAKA_SELECTORS } from './config.js';

export function parseItakaPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseItakaStars(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? Math.min(5, parseInt(match[1]!, 10)) : 4;
}

export function parseItakaNights(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 7;
}

export function parseItakaBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ultra') || lower.includes('uai')) return 'ultra-all-inclusive';
  if (lower.includes('all inclusive') || lower.includes('ai') || lower.includes('all-inclusive')) return 'all-inclusive';
  if (lower.includes('half') || lower.includes('hb') || lower.includes('śniadania i kolacje')) return 'half-board';
  if (lower.includes('full') || lower.includes('fb') || lower.includes('pełne')) return 'full-board';
  if (lower.includes('bb') || lower.includes('śniadanie')) return 'bed-and-breakfast';
  if (lower.includes('ro') || lower.includes('bez wyżywienia')) return 'room-only';
  return 'unknown';
}

export function parseItakaDate(raw: string): string {
  // Itaka uses D.MM.YYYY format e.g. "9.04.2026"
  const dotFormat = /^(\d{1,2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (dotFormat) return `${dotFormat[3]}-${dotFormat[2]}-${dotFormat[1]!.padStart(2, '0')}`;

  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return raw.slice(0, 10);

  return new Date().toISOString().split('T')[0]!;
}

export function parseItakaAirport(raw: string): string {
  const match = /\(([A-Z]{3})\)/.exec(raw) ?? /([A-Z]{3})/.exec(raw);
  if (match) return match[1]!;
  if (raw.includes('Katowice') || raw.toLowerCase().includes('ktw')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('Krakow') || raw.toLowerCase().includes('krk')) return 'KRK';
  if (raw.includes('Warszawa') || raw.includes('Warsaw') || raw.toLowerCase().includes('waw')) return 'WAW';
  if (raw.includes('Gdańsk') || raw.includes('Gdansk') || raw.toLowerCase().includes('gdn')) return 'GDN';
  if (raw.includes('Wrocław') || raw.includes('Wroclaw') || raw.toLowerCase().includes('wro')) return 'WRO';
  if (raw.includes('Poznań') || raw.includes('Poznan') || raw.toLowerCase().includes('poz')) return 'POZ';
  return 'KTW';
}

/** Map URL destination slug to display name */
const SLUG_TO_COUNTRY: Record<string, string> = {
  'grecja': 'Grecja',
  'turcja': 'Turcja',
  'egipt': 'Egipt',
  'hiszpania': 'Hiszpania',
  'cypr': 'Cypr',
  'tunezja': 'Tunezja',
  'bulgaria': 'Bułgaria',
  'chorwacja': 'Chorwacja',
  'malta': 'Malta',
  'wyspy-kanaryjskie': 'Wyspy Kanaryjskie',
  'portugalia': 'Portugalia',
  'maroko': 'Maroko',
  'albania': 'Albania',
  'czarnogora': 'Czarnogóra',
};

/** Extract country name from Itaka search URL slug */
function countryFromUrl(url: string): string {
  const m = /\/wyniki-wyszukiwania\/wakacje\/([^/?#]+)/.exec(url);
  if (!m) return '';
  return SLUG_TO_COUNTRY[m[1]!] ?? m[1]!;
}

/** Map a single rate object from Itaka's main.rates.list[] to RawOffer */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItakaRateOffer(rate: any, sourceUrl: string): RawOffer | null {
  const segments: unknown[] = rate.segments ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flights = segments.filter((s: any) => s.type === 'flight') as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hotelSeg = (segments as any[]).find((s: any) => s.type === 'hotel');

  const hotelName = hotelSeg?.content?.title ?? '';
  if (!hotelName) return null;

  // Stars: hotelRating is 30 / 40 / 50 (stars × 10)
  const rawRating = Number(hotelSeg?.content?.hotelRating ?? 40);
  const hotelStars = Math.min(5, Math.max(1, Math.round(rawRating / 10))) as RawOffer['hotelStars'];

  // Outbound flight = earliest beginDateTime
  const outbound = flights[0];
  // Return flight = last element (if > 1)
  const inbound = flights.length > 1 ? flights[flights.length - 1] : null;

  // Departure date from first flight's beginDateTime (ISO string with timezone)
  const departureDate = (outbound?.beginDateTime ?? hotelSeg?.beginDate ?? '').slice(0, 10)
    || new Date().toISOString().slice(0, 10);

  // Return date from hotel endDate (most reliable)
  const returnDate = (hotelSeg?.endDate ?? inbound?.beginDateTime ?? departureDate).slice(0, 10);

  // Nights from hotel dates (most accurate)
  const nights = hotelSeg?.beginDate && hotelSeg?.endDate
    ? Math.round((new Date(hotelSeg.endDate).getTime() - new Date(hotelSeg.beginDate).getTime()) / 86_400_000)
    : 7;

  // Board type from meal.id (A=AI, UA=UAI, HB, FB, BB, RO) or meal.title fallback
  const meal = hotelSeg?.meal;
  const mealId = (meal?.id ?? '').toUpperCase();
  const boardType: RawOffer['boardType'] =
    mealId === 'UA' || mealId === 'UAI' ? 'ultra-all-inclusive' :
    mealId === 'A' || mealId === 'AI' ? 'all-inclusive' :
    mealId === 'HB' ? 'half-board' :
    mealId === 'FB' ? 'full-board' :
    mealId === 'BB' ? 'bed-and-breakfast' :
    mealId === 'RO' ? 'room-only' :
    parseItakaBoardType(meal?.title ?? '');

  // Prices are in grosze (1/100 PLN) — divide by 100
  const priceTotal = Math.round(Number(rate.price ?? 0) / 100);
  const participants: unknown[] = rate.participants ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adultPrices = (participants as any[]).filter((p: any) => p.type === 'adult');
  const pricePerPerson = adultPrices[0]?.price
    ? Math.round(Number(adultPrices[0].price) / 100)
    : Math.round(priceTotal / Math.max(1, adultPrices.length || 2));

  if (priceTotal <= 0) return null;

  // Departure airport from outbound flight departure title
  const departureAirport = parseItakaAirport(outbound?.departure?.title ?? '');

  // Resort / location = outbound flight destination (e.g. "Korfu", "Antalya")
  const hotelLocation = outbound?.destination?.title ?? '';

  // Country from URL slug (most reliable) or flight destination city as fallback
  const destinationRaw = countryFromUrl(sourceUrl) || hotelLocation;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adults = (participants as any[]).filter((p: any) => p.type === 'adult').length || 2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = (participants as any[]).filter((p: any) => p.type === 'child').length || 0;

  return {
    providerCode: 'itaka',
    providerOfferId: String(rate.id ?? rate.supplierObjectId ?? ''),
    hotelName,
    hotelStars,
    hotelLocation,
    destinationRaw,
    departureAirport,
    departureDate,
    returnDate,
    nights,
    boardType,
    priceTotal,
    pricePerPerson,
    currency: String(rate.currency ?? 'PLN'),
    adults,
    children,
    sourceUrl,
    rawData: rate as Record<string, unknown>,
  };
}

/**
 * Extract offers from Itaka's React Query initialQueryState (in __NEXT_DATA__ or _next/data/* responses).
 * Itaka's actual data path: queries[i].state.data.main.rates.list
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromQueryState(queryState: any, sourceUrl: string): RawOffer[] {
  const queries: unknown[] = queryState?.queries ?? (Array.isArray(queryState) ? queryState : []);
  for (const q of queries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (q as any)?.state?.data as any;
    const list: unknown[] = data?.main?.rates?.list ?? [];
    if (Array.isArray(list) && list.length > 0) {
      const offers: RawOffer[] = [];
      for (const rate of list) {
        const offer = mapItakaRateOffer(rate, sourceUrl);
        if (offer) offers.push(offer);
      }
      if (offers.length > 0) {
        logger.debug(`Itaka React Query: mapped ${offers.length} offers from main.rates.list`, undefined, 'itaka');
        return offers;
      }
    }
  }
  return [];
}

/** Extract offers from Itaka's __NEXT_DATA__ JSON blob */
export async function parseItakaNextData(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  try {
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el?.textContent) {
        try { return JSON.parse(el.textContent); }
        catch { return null; }
      }
      return null;
    });

    if (!nextData) {
      logger.debug('Itaka __NEXT_DATA__ not found', undefined, 'itaka');
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (nextData as any)?.props?.pageProps;
    if (!props) return [];

    // Primary: React Query initialQueryState → queries[i].state.data.main.rates.list
    if (props?.initialQueryState) {
      const offers = extractFromQueryState(props.initialQueryState, sourceUrl);
      if (offers.length > 0) return offers;
    }

    // Fallback: older / direct pageProps fields
    const offerList: unknown[] =
      props?.offers ?? props?.searchResults?.offers ?? props?.results ?? props?.data?.offers ?? [];
    if (!Array.isArray(offerList) || offerList.length === 0) return [];

    const offers: RawOffer[] = [];
    for (const raw of offerList) {
      const offer = mapItakaRateOffer(raw, sourceUrl);
      if (offer) offers.push(offer);
    }
    return offers;
  } catch (err) {
    logger.warn('Failed to parse Itaka __NEXT_DATA__', { error: String(err) }, 'itaka');
    return [];
  }
}

/**
 * Try to extract offer data from any intercepted Itaka API/Next.js JSON response.
 * Handles both direct API responses and Next.js _next/data/* route responses.
 */
export function parseItakaApiResponse(json: unknown, sourceUrl = 'https://www.itaka.pl'): RawOffer[] {
  if (!json || typeof json !== 'object') return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = json as any;

  // _next/data/** format: { pageProps: { initialQueryState: { queries: [...] } } }
  if (data?.pageProps?.initialQueryState) {
    const offers = extractFromQueryState(data.pageProps.initialQueryState, sourceUrl);
    if (offers.length > 0) return offers;
  }

  // Direct main.rates.list (raw API response)
  const directList: unknown[] = data?.main?.rates?.list ?? [];
  if (Array.isArray(directList) && directList.length > 0) {
    const offers: RawOffer[] = [];
    for (const rate of directList) {
      const offer = mapItakaRateOffer(rate, sourceUrl);
      if (offer) offers.push(offer);
    }
    if (offers.length > 0) return offers;
  }

  // Legacy / other shapes
  const offerList: unknown[] =
    data?.offers ??
    data?.results ??
    data?.data?.offers ??
    data?.pageProps?.offers ??
    data?.pageProps?.searchResults?.offers ??
    data?.pageProps?.results ??
    data?.searchResults?.offers ??
    [];

  if (!Array.isArray(offerList) || offerList.length === 0) return [];

  const offers: RawOffer[] = [];
  for (const raw of offerList) {
    const offer = mapItakaRateOffer(raw, sourceUrl);
    if (offer) offers.push(offer);
  }
  return offers;
}

/** DOM fallback parser */
export async function parseItakaPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  // Try __NEXT_DATA__ first (SSR'd — works without JS execution delay)
  const nextDataOffers = await parseItakaNextData(page, sourceUrl);
  if (nextDataOffers.length > 0) {
    logger.info(`Parsed ${nextDataOffers.length} Itaka offers from __NEXT_DATA__`, undefined, 'itaka');
    return nextDataOffers;
  }

  // DOM fallback
  const cards = page.locator(ITAKA_SELECTORS.offerCard);
  const count = await cards.count();
  logger.debug(`Itaka DOM fallback: ${count} offer cards`, undefined, 'itaka');

  const offers: RawOffer[] = [];
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

      const hotelName = await getText(ITAKA_SELECTORS.hotelName);
      if (!hotelName) continue;

      const depDate = parseItakaDate(await getText(ITAKA_SELECTORS.departureDate));
      const nights = parseItakaNights(await getText(ITAKA_SELECTORS.nights));
      const priceTotal = parseItakaPrice(await getText(ITAKA_SELECTORS.priceTotal));
      if (!priceTotal || priceTotal < 100) continue;

      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      const href = await getAttr(ITAKA_SELECTORS.offerLink, 'href');
      const offerUrl = href
        ? href.startsWith('http') ? href : `https://www.itaka.pl${href}`
        : sourceUrl;

      offers.push({
        providerCode: 'itaka',
        hotelName,
        hotelStars: parseItakaStars(await getText(ITAKA_SELECTORS.hotelStars)) as RawOffer['hotelStars'],
        hotelLocation: await getText(ITAKA_SELECTORS.hotelLocation),
        destinationRaw: countryFromUrl(sourceUrl) || await getText(ITAKA_SELECTORS.hotelLocation),
        departureAirport: parseItakaAirport(await getText(ITAKA_SELECTORS.departureAirport)) || 'KTW',
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseItakaBoardType(await getText(ITAKA_SELECTORS.boardType)),
        priceTotal,
        pricePerPerson: parseItakaPrice(await getText(ITAKA_SELECTORS.pricePerPerson)) || Math.round(priceTotal / 2),
        currency: 'PLN',
        adults: 2,
        children: 0,
        sourceUrl: offerUrl,
      });
    } catch (err) {
      logger.warn(`Failed to parse Itaka card ${i}`, { error: String(err) }, 'itaka');
    }
  }

  return offers;
}
