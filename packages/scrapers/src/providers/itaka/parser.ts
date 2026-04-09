import type { Page } from 'playwright';
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

/** Extract offers from Itaka's __NEXT_DATA__ JSON blob */
export async function parseItakaNextData(page: Page): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  try {
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el?.textContent) {
        try { return JSON.parse(el.textContent); }
        catch { return null; }
      }
      return null;
    });

    if (!nextData) return offers;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (nextData as any)?.props?.pageProps;
    const offerList = props?.offers ?? props?.searchResults?.offers ?? props?.results ?? [];

    if (!Array.isArray(offerList)) return offers;

    for (const raw of offerList) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = raw as any;
        const departureDate = parseItakaDate(String(r.departureDate ?? r.flightDate ?? ''));
        const nights = Number(r.nights ?? r.duration ?? 7);
        const returnDateObj = new Date(departureDate);
        returnDateObj.setDate(returnDateObj.getDate() + nights);

        const offer: RawOffer = {
          providerCode: 'itaka',
          providerOfferId: String(r.id ?? r.offerId ?? r.code ?? ''),
          hotelName: String(r.hotelName ?? r.hotel?.name ?? r.name ?? ''),
          hotelStars: Math.min(5, Math.max(1, Number(r.stars ?? r.hotelCategory ?? r.hotel?.stars ?? 4))) as RawOffer['hotelStars'],
          hotelLocation: String(r.location ?? r.resort ?? r.region ?? r.city ?? ''),
          destinationRaw: String(r.country ?? r.destination ?? r.countryName ?? ''),
          departureAirport: parseItakaAirport(String(r.departureAirport ?? r.airport ?? r.from ?? '')),
          departureDate,
          returnDate: returnDateObj.toISOString().split('T')[0]!,
          nights,
          boardType: parseItakaBoardType(String(r.boardType ?? r.board ?? r.mealType ?? '')),
          priceTotal: Number(r.priceTotal ?? r.price?.total ?? r.price ?? 0),
          pricePerPerson: Number(r.pricePerPerson ?? r.price?.perPerson ?? 0),
          currency: String(r.currency ?? 'PLN'),
          adults: Number(r.adults ?? 2),
          children: Number(r.children ?? 0),
          sourceUrl: String(r.url ?? r.offerUrl ?? 'https://www.itaka.pl'),
          rawData: r as Record<string, unknown>,
        };

        if (offer.hotelName && offer.priceTotal > 0) offers.push(offer);
      } catch {
        // skip
      }
    }
  } catch (err) {
    logger.warn('Failed to parse Itaka __NEXT_DATA__', { error: String(err) }, 'itaka');
  }

  return offers;
}

export function parseItakaAirport(raw: string): string {
  const match = /\(([A-Z]{3})\)/.exec(raw) ?? /([A-Z]{3})/.exec(raw);
  if (match) return match[1]!;
  if (raw.includes('Katowice') || raw.toLowerCase().includes('ktw')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('Krakow') || raw.toLowerCase().includes('krk')) return 'KRK';
  return 'KTW';
}

/** DOM fallback parser */
export async function parseItakaPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  // Try __NEXT_DATA__ first
  const nextDataOffers = await parseItakaNextData(page);
  if (nextDataOffers.length > 0) {
    logger.debug(`Parsed ${nextDataOffers.length} offers from Itaka __NEXT_DATA__`, undefined, 'itaka');
    return nextDataOffers;
  }

  // DOM fallback
  const cards = page.locator(ITAKA_SELECTORS.offerCard);
  const count = await cards.count();
  logger.debug(`Found ${count} Itaka offer cards (DOM)`, undefined, 'itaka');

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
        destinationRaw: await getText(ITAKA_SELECTORS.hotelLocation),
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
