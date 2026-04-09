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

export async function parseTuiPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  // Try window state first
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
