/**
 * Live search — Itaka HTTP fetcher
 *
 * Itaka is a Next.js app that SSR-embeds all offer data in __NEXT_DATA__,
 * so a plain fetch() returns full search results without any browser/JS overhead.
 *
 * This module is web-app-only (no patchright dependency).
 * Mirrors the logic from packages/scrapers/src/providers/itaka/{config,parser}.ts.
 */

export interface LiveOffer {
  id: string;
  providerCode: 'itaka';
  hotelName: string;
  hotelStars: number;
  hotelLocation: string;
  destinationRaw: string;
  departureAirport: string;
  departureDate: string;
  returnDate: string;
  nights: number;
  boardType: string;
  priceTotal: number;
  pricePerPerson: number;
  currency: string;
  adults: number;
  children: number;
  sourceUrl: string;
}

export interface LiveSearchParams {
  destinations: string[];
  airports: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  nightsMin: number;
  nightsMax: number;
  adults: number;
  boardTypes: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.itaka.pl/wyniki-wyszukiwania/wakacje/';

const DEST_MAP: Record<string, string> = {
  turkey: 'turcja',
  egypt: 'egipt',
  greece: 'grecja',
  spain: 'hiszpania',
  cyprus: 'cypr',
  tunisia: 'tunezja',
  bulgaria: 'bulgaria',
  croatia: 'chorwacja',
  malta: 'malta',
  'canary-islands': 'wyspy-kanaryjskie',
  portugal: 'portugalia',
  morocco: 'maroko',
  albania: 'albania',
  montenegro: 'czarnogora',
};

const BOARD_MAP: Record<string, string> = {
  'all-inclusive': 'ai',
  'ultra-all-inclusive': 'uai',
  'half-board': 'hb',
  'full-board': 'fb',
  'bed-and-breakfast': 'bb',
  'room-only': 'ro',
};

const SLUG_TO_COUNTRY: Record<string, string> = {
  turcja: 'Turcja',
  grecja: 'Grecja',
  egipt: 'Egipt',
  hiszpania: 'Hiszpania',
  cypr: 'Cypr',
  tunezja: 'Tunezja',
  bulgaria: 'Bułgaria',
  chorwacja: 'Chorwacja',
  malta: 'Malta',
  'wyspy-kanaryjskie': 'Wyspy Kanaryjskie',
  portugalia: 'Portugalia',
  maroko: 'Maroko',
  albania: 'Albania',
  czarnogora: 'Czarnogóra',
};

// ─── URL Builder ──────────────────────────────────────────────────────────────

function formatItakaDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${parseInt(day!, 10)}.${month}.${year}`;
}

function buildUrl(destSlug: string, p: LiveSearchParams): string {
  const enc = encodeURIComponent;
  const boards = p.boardTypes.map((b) => BOARD_MAP[b]).filter(Boolean) as string[];

  const parts: string[] = [
    `dateFrom=${enc(formatItakaDate(p.dateFrom))}`,
    `dateTo=${enc(formatItakaDate(p.dateTo))}`,
    `departuresByPlane=${enc(p.airports.join(','))}`,
    `durationMin=${p.nightsMin}`,
    `durationMax=${p.nightsMax}`,
    `participants[0][adults]=${p.adults}`,
  ];

  if (boards.length > 0) {
    parts.push(`boardType=${enc(boards.join(','))}`);
  }

  return `${BASE_URL}${destSlug}/?${parts.join('&')}`;
}

// ─── HTTP Fetch ───────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(25_000),
    // Next.js route cache — we always want fresh results
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ─── Offer Mapper (mirrors parser.ts mapItakaRateOffer) ───────────────────────

function parseAirport(raw: string): string {
  const m = /\(([A-Z]{3})\)/.exec(raw) ?? /([A-Z]{3})/.exec(raw);
  if (m) return m[1]!;
  if (raw.includes('Katowice')) return 'KTW';
  if (raw.includes('Kraków') || raw.includes('Krakow')) return 'KRK';
  if (raw.includes('Warszawa') || raw.includes('Warsaw')) return 'WAW';
  if (raw.includes('Gdańsk') || raw.includes('Gdansk')) return 'GDN';
  if (raw.includes('Wrocław') || raw.includes('Wroclaw')) return 'WRO';
  return 'KTW';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRate(rate: any, destSlug: string, sourceUrl: string): LiveOffer | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segments: any[] = rate.segments ?? [];
  const flights = segments.filter((s) => s.type === 'flight');
  const hotelSeg = segments.find((s) => s.type === 'hotel');

  const hotelName: string = hotelSeg?.content?.title ?? '';
  if (!hotelName) return null;

  const rawRating = Number(hotelSeg?.content?.hotelRating ?? 40);
  const hotelStars = Math.min(5, Math.max(1, Math.round(rawRating / 10)));

  const outbound = flights[0];
  const inbound = flights.length > 1 ? flights[flights.length - 1] : null;

  const departureDate =
    (outbound?.beginDateTime ?? hotelSeg?.beginDate ?? '').slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  const returnDate = (hotelSeg?.endDate ?? inbound?.beginDateTime ?? departureDate).slice(0, 10);

  const nights =
    hotelSeg?.beginDate && hotelSeg?.endDate
      ? Math.round(
          (new Date(hotelSeg.endDate).getTime() - new Date(hotelSeg.beginDate).getTime()) /
            86_400_000,
        )
      : 7;

  const mealId = (hotelSeg?.meal?.id ?? '').toUpperCase();
  const boardType =
    mealId === 'UA' || mealId === 'UAI'
      ? 'ultra-all-inclusive'
      : mealId === 'A' || mealId === 'AI'
        ? 'all-inclusive'
        : mealId === 'HB'
          ? 'half-board'
          : mealId === 'FB'
            ? 'full-board'
            : mealId === 'BB'
              ? 'bed-and-breakfast'
              : mealId === 'RO'
                ? 'room-only'
                : 'unknown';

  const priceTotal = Math.round(Number(rate.price ?? 0) / 100);
  if (priceTotal <= 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants: any[] = rate.participants ?? [];
  const adultPrices = participants.filter((p) => p.type === 'adult');
  const pricePerPerson = adultPrices[0]?.price
    ? Math.round(Number(adultPrices[0].price) / 100)
    : Math.round(priceTotal / Math.max(1, adultPrices.length || 2));

  return {
    id: String(rate.id ?? rate.supplierObjectId ?? `${hotelName}-${departureDate}`),
    providerCode: 'itaka',
    hotelName,
    hotelStars,
    hotelLocation: outbound?.destination?.title ?? '',
    destinationRaw: SLUG_TO_COUNTRY[destSlug] ?? destSlug,
    departureAirport: parseAirport(outbound?.departure?.title ?? ''),
    departureDate,
    returnDate,
    nights,
    boardType,
    priceTotal,
    pricePerPerson,
    currency: String(rate.currency ?? 'PLN'),
    adults: participants.filter((p) => p.type === 'adult').length || 2,
    children: participants.filter((p) => p.type === 'child').length || 0,
    sourceUrl,
  };
}

// ─── HTML Parser ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractQueryState(queryState: any, destSlug: string, sourceUrl: string): LiveOffer[] {
  const queries: unknown[] = queryState?.queries ?? (Array.isArray(queryState) ? queryState : []);
  for (const q of queries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: unknown[] = (q as any)?.state?.data?.main?.rates?.list ?? [];
    if (Array.isArray(list) && list.length > 0) {
      const offers: LiveOffer[] = [];
      for (const rate of list) {
        const offer = mapRate(rate, destSlug, sourceUrl);
        if (offer) offers.push(offer);
      }
      if (offers.length > 0) return offers;
    }
  }
  return [];
}

function parseHtml(html: string, destSlug: string, sourceUrl: string): LiveOffer[] {
  const match = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];

  let nextData: unknown;
  try {
    nextData = JSON.parse(match[1]!);
  } catch {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (nextData as any)?.props?.pageProps;
  if (!props) return [];

  if (props?.initialQueryState) {
    return extractQueryState(props.initialQueryState, destSlug, sourceUrl);
  }
  return [];
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function searchItakaDestination(
  canonical: string,
  params: LiveSearchParams,
): Promise<{ offers: LiveOffer[]; error?: string }> {
  const slug = DEST_MAP[canonical];
  if (!slug) return { offers: [], error: `Unknown destination: ${canonical}` };

  const url = buildUrl(slug, params);
  try {
    const html = await fetchHtml(url);
    const offers = parseHtml(html, slug, url);
    return { offers };
  } catch (err) {
    return { offers: [], error: String(err) };
  }
}

/**
 * Search all requested destinations in parallel, yielding results as each completes.
 * Uses Promise.race so UI gets updates as soon as any destination finishes.
 */
export async function* searchItakaLive(
  params: LiveSearchParams,
): AsyncGenerator<{ destination: string; offers: LiveOffer[]; error?: string }> {
  const dests = params.destinations.filter((d) => DEST_MAP[d]);
  if (dests.length === 0) return;

  // Tag each promise with its index so we can identify which resolved
  const pending = new Map(
    dests.map((dest, i) => [
      i,
      searchItakaDestination(dest, params).then((r) => ({ i, dest, ...r })),
    ]),
  );

  while (pending.size > 0) {
    const { i, dest, offers, error } = await Promise.race(pending.values());
    pending.delete(i);
    yield { destination: dest, offers, error };
  }
}
