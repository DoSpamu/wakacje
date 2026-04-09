import type { Page } from 'playwright';
import type { RawOffer } from '@wakacje/shared';
import { logger } from '../../base/logger.js';
import { TUI_SELECTORS } from './config.js';

export function parseTuiPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseTuiStars(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? Math.min(5, parseInt(match[1]!, 10)) : 4;
}

export function parseTuiNights(raw: string): number {
  const match = /(\d+)/.exec(raw);
  return match ? parseInt(match[1]!, 10) : 7;
}

export function parseTuiBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  const code = raw.toUpperCase();

  if (code.includes('GT06-XX') || lower.includes('ultra')) return 'ultra-all-inclusive';
  if (code.includes('GT06-AI') || code.includes('GT06-AIP') || lower.includes('all inclusive') || lower.includes('all-inclusive')) return 'all-inclusive';
  if (code.includes('GT06-HB') || lower.includes('half') || lower.includes('hb')) return 'half-board';
  if (code.includes('GT06-FB') || lower.includes('full') || lower.includes('fb')) return 'full-board';
  if (code.includes('GT06-BB') || lower.includes('breakfast') || lower.includes('bb')) return 'bed-and-breakfast';
  if (code.includes('GT06-RO') || lower.includes('room only') || lower.includes('ro')) return 'room-only';
  return 'unknown';
}

export function parseTuiDate(raw: string): string {
  const ddmmyyyy = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return raw.slice(0, 10);
  return new Date().toISOString().split('T')[0]!;
}

export function parseTuiAirport(raw: string): string {
  const match = /\(([A-Z]{3})\)/.exec(raw) ?? /([A-Z]{3})/.exec(raw);
  if (match) return match[1]!;
  if (raw.includes('Katowice')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('Krakow')) return 'KRK';
  return 'KTW';
}

/** Try to extract TUI offer data from window state or Next.js data */
async function parseTuiWindowState(page: Page): Promise<RawOffer[]> {
  try {
    const windowData = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      // TUI might expose state in various forms
      return (
        win.__TUI_STATE__ ??
        win.__INITIAL_STATE__ ??
        win.tuiState ??
        null
      );
    });

    if (!windowData) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = windowData as any;
    const offerList = data?.offers ?? data?.results ?? data?.searchResults?.offers ?? [];

    if (!Array.isArray(offerList)) return [];

    return offerList.map((raw: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      const depDate = parseTuiDate(String(r.departureDate ?? r.date ?? ''));
      const nights = Number(r.nights ?? r.duration ?? 7);
      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      return {
        providerCode: 'tui' as const,
        providerOfferId: String(r.id ?? r.offerId ?? ''),
        hotelName: String(r.hotelName ?? r.hotel?.name ?? ''),
        hotelStars: Math.min(5, Number(r.stars ?? r.hotelCategory ?? 4)) as RawOffer['hotelStars'],
        hotelLocation: String(r.location ?? r.resort ?? r.destination ?? ''),
        destinationRaw: String(r.country ?? r.countryName ?? ''),
        departureAirport: parseTuiAirport(String(r.departureAirport ?? r.from ?? '')),
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseTuiBoardType(String(r.boardType ?? r.board ?? r.boardCode ?? '')),
        priceTotal: Number(r.price ?? r.totalPrice ?? r.priceTotal ?? 0),
        pricePerPerson: Number(r.pricePerPerson ?? r.perPersonPrice ?? 0),
        currency: 'PLN',
        adults: Number(r.adults ?? 2),
        children: Number(r.children ?? 0),
        sourceUrl: String(r.url ?? r.offerUrl ?? 'https://www.tui.pl'),
        rawData: r as Record<string, unknown>,
      } satisfies RawOffer;
    }).filter((o: RawOffer) => o.hotelName && o.priceTotal > 0);
  } catch {
    return [];
  }
}

/**
 * Parse TUI OfferCodeWS from offer URL.
 *
 * Format: [3-dep-airport][3-dest-code][8-dep-date][4-dep-time][8-dup-dep][8-ret-date][4-ret-time]L[2-nights][8-hotel]...
 * Example: KTWJGA20260506055020260506202605130800L07VRN85058APX1UA02...
 */
function parseTuiOfferCode(offerUrl: string): { depAirport: string; depDate: string; retDate: string; nights: number } | null {
  const codeMatch = /\/OfferCodeWS\/([A-Z0-9]+)/.exec(offerUrl);
  if (!codeMatch) return null;
  const code = codeMatch[1]!;
  if (code.length < 41) return null;

  try {
    const depAirport = code.slice(0, 3);
    const depRaw = code.slice(6, 14);   // YYYYMMDD
    const retRaw = code.slice(26, 34);  // YYYYMMDD
    const nightsStr = code.slice(39, 41); // 2-digit nights after 'L'

    const toDate = (raw: string) =>
      `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;

    return {
      depAirport,
      depDate: toDate(depRaw),
      retDate: toDate(retRaw),
      nights: parseInt(nightsStr, 10) || 7,
    };
  } catch {
    return null;
  }
}

/** Parse TUI JSON-LD ItemList for hotel offers */
async function parseTuiJsonLd(page: Page): Promise<RawOffer[]> {
  try {
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const results: unknown[] = [];
      scripts.forEach((s) => {
        try { results.push(JSON.parse(s.textContent ?? '')); } catch { /* skip */ }
      });
      return results;
    });

    const offers: RawOffer[] = [];

    for (const ld of jsonLdData as unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = ld as any;
      const itemList = schema?.['@type'] === 'ItemList'
        ? schema.itemListElement
        : schema?.itemListElement ?? [];

      if (!Array.isArray(itemList)) continue;

      for (const item of itemList) {
        try {
          const url = String(item?.url ?? '');
          const name = String(item?.name ?? '');
          if (!name || !url) continue;

          // Extract destination from URL path: /wypoczynek/[country]/[region]/[hotel]/
          const pathMatch = /\/wypoczynek\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(url);
          const country = pathMatch?.[1] ?? '';
          const region = pathMatch?.[2] ?? '';

          // Decode OfferCodeWS for departure info
          const codeInfo = parseTuiOfferCode(url);
          if (!codeInfo) continue;

          // Try to detect board type from URL code (UA = ultra-AI, AI = all-inclusive)
          const codeMatch = /\/OfferCodeWS\/([A-Z0-9]+)/.exec(url);
          const code = codeMatch?.[1] ?? '';
          let boardType: RawOffer['boardType'] = 'all-inclusive';
          if (code.includes('UA0') || code.includes('XX')) boardType = 'ultra-all-inclusive';
          else if (code.includes('HB')) boardType = 'half-board';
          else if (code.includes('FB')) boardType = 'full-board';
          else if (code.includes('BB')) boardType = 'bed-and-breakfast';
          else if (code.includes('RO') && !code.includes('ROUAPX')) boardType = 'room-only';

          offers.push({
            providerCode: 'tui',
            hotelName: name,
            hotelStars: 4, // not in JSON-LD, will be enriched
            hotelLocation: region.replace(/-/g, ' '),
            destinationRaw: country,
            departureAirport: codeInfo.depAirport,
            departureDate: codeInfo.depDate,
            returnDate: codeInfo.retDate,
            nights: codeInfo.nights,
            boardType,
            priceTotal: 0,    // not in JSON-LD — marked for DOM price extraction below
            pricePerPerson: 0,
            currency: 'PLN',
            adults: 2,
            children: 0,
            sourceUrl: url,
          });
        } catch { /* skip malformed */ }
      }
    }

    return offers;
  } catch {
    return [];
  }
}

/** Try to enrich JSON-LD offers with prices from the DOM */
async function enrichWithDomPrices(page: Page, offers: RawOffer[]): Promise<RawOffer[]> {
  try {
    // Wait briefly for price elements
    await page.waitForSelector('[class*="price"], [class*="Price"]', { timeout: 10000 }).catch(() => null);

    // Extract all price numbers from visible DOM
    const prices = await page.evaluate((): number[] => {
      const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"], [data-testid*="price"]');
      const nums: number[] = [];
      priceEls.forEach((el) => {
        const text = el.textContent ?? '';
        const num = parseFloat(text.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
        if (num > 100) nums.push(num);
      });
      return nums;
    });

    if (prices.length === 0) return offers;

    // Assign prices to offers (best-effort — same order as DOM)
    return offers.map((o, i) => ({
      ...o,
      priceTotal: prices[i] ?? prices[0] ?? 0,
      pricePerPerson: Math.round((prices[i] ?? prices[0] ?? 0) / 2),
    }));
  } catch {
    return offers;
  }
}

export async function parseTuiPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  // Try JSON-LD first (server-side rendered, most reliable)
  const jsonLdOffers = await parseTuiJsonLd(page);
  if (jsonLdOffers.length > 0) {
    logger.debug(`Parsed ${jsonLdOffers.length} TUI offers from JSON-LD`, undefined, 'tui');
    const enriched = await enrichWithDomPrices(page, jsonLdOffers);
    // Filter out zero-price offers only if we got no prices at all
    const withPrice = enriched.filter((o) => o.priceTotal > 0);
    return withPrice.length > 0 ? withPrice : enriched;
  }

  // Try window state
  const stateOffers = await parseTuiWindowState(page);
  if (stateOffers.length > 0) {
    logger.debug(`Parsed ${stateOffers.length} TUI offers from window state`, undefined, 'tui');
    return stateOffers;
  }

  // DOM fallback
  const offers: RawOffer[] = [];
  const cards = page.locator(TUI_SELECTORS.offerCard);
  const count = await cards.count();
  logger.debug(`Found ${count} TUI offer cards (DOM)`, undefined, 'tui');

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

      const hotelName = await getText(TUI_SELECTORS.hotelName);
      if (!hotelName) continue;

      const depDate = parseTuiDate(await getText(TUI_SELECTORS.departureDate));
      const nights = parseTuiNights(await getText(TUI_SELECTORS.nights));
      const priceTotal = parseTuiPrice(await getText(TUI_SELECTORS.priceTotal));
      if (!priceTotal || priceTotal < 100) continue;

      const returnDateObj = new Date(depDate);
      returnDateObj.setDate(returnDateObj.getDate() + nights);

      const href = await getAttr(TUI_SELECTORS.offerLink, 'href');
      const offerUrl = href
        ? href.startsWith('http') ? href : `https://www.tui.pl${href}`
        : sourceUrl;

      offers.push({
        providerCode: 'tui',
        hotelName,
        hotelStars: parseTuiStars(await getText(TUI_SELECTORS.hotelStars)) as RawOffer['hotelStars'],
        hotelLocation: await getText(TUI_SELECTORS.hotelLocation),
        destinationRaw: await getText(TUI_SELECTORS.hotelLocation),
        departureAirport: parseTuiAirport(await getText(TUI_SELECTORS.departureAirport)) || 'KTW',
        departureDate: depDate,
        returnDate: returnDateObj.toISOString().split('T')[0]!,
        nights,
        boardType: parseTuiBoardType(await getText(TUI_SELECTORS.boardType)),
        priceTotal,
        pricePerPerson: parseTuiPrice(await getText(TUI_SELECTORS.pricePerPerson)) || Math.round(priceTotal / 2),
        currency: 'PLN',
        adults: 2,
        children: 0,
        sourceUrl: offerUrl,
      });
    } catch (err) {
      logger.warn(`Failed to parse TUI card ${i}`, { error: String(err) }, 'tui');
    }
  }

  return offers;
}
