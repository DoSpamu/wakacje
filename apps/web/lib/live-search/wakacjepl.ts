/**
 * Live search — Wakacje.pl HTTP fetcher
 *
 * wakacje.pl is a Next.js aggregator that SSR-embeds offer data in __NEXT_DATA__
 * (props.stores.storeOffers.offers.data), so a plain fetch() gives ~10 offers per
 * destination without any browser/JS overhead.
 *
 * Covers ~35 tour operators including Coral Travel, Exim, TUI and others.
 */

export interface WakacjePlLiveOffer {
  id: string;
  providerCode: 'wakacjepl';
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
  tourOperator: string;
  sourceUrl: string;
}

// --- Config ---

const BASE_URL = 'https://www.wakacje.pl/wczasy';

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

// --- HTTP Fetch ---

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
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- Board Type ---

function parseBoardType(serviceDesc: string): string {
  const s = serviceDesc.toLowerCase();
  if (s.includes('ultra all') || s.includes('ultra-all')) return 'ultra-all-inclusive';
  if (s.includes('all inclusive') || s.includes('all-inclusive')) return 'all-inclusive';
  if (s.includes('half board') || s.includes('hb') || s.includes('polpensja')) return 'half-board';
  if (s.includes('full board') || s.includes('fb')) return 'full-board';
  if (s.includes('sniadanie') || s.includes('breakfast') || s.includes('bb')) return 'bed-and-breakfast';
  if (s.includes('bez wyzywienia') || s.includes('room only') || s.includes('ro')) return 'room-only';
  return 'unknown';
}

// --- Offer Mapper ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(raw: any, slug: string, sourceUrl: string): WakacjePlLiveOffer | null {
  try {
    const hotelName = String(raw.name ?? '').trim();
    if (!hotelName) return null;

    const priceTotal = Number(raw.price ?? 0);
    if (priceTotal <= 0) return null;

    const nights = Number(raw.durationNights ?? raw.duration ?? 7);
    const departureDate = String(raw.departureDate ?? '').slice(0, 10);
    if (!departureDate) return null;

    const returnDate = raw.returnDate
      ? String(raw.returnDate).slice(0, 10)
      : (() => {
          const d = new Date(departureDate);
          d.setDate(d.getDate() + nights);
          return d.toISOString().slice(0, 10);
        })();

    const place = raw.place ?? {};
    const cityName: string = place?.city?.name ?? '';
    const regionName: string = place?.region?.name ?? '';
    const countryName: string =
      place?.country?.name ?? String(raw.placeName ?? '').split('/')[0]?.trim() ?? '';

    const locationParts: string[] = [];
    if (cityName) locationParts.push(cityName);
    if (regionName && regionName !== cityName) locationParts.push(regionName);
    if (countryName) locationParts.push(countryName);

    const adults = Number(raw.adults ?? 2);

    return {
      id: String(raw.offerId ?? raw.id ?? `${hotelName}-${departureDate}-${slug}`),
      providerCode: 'wakacjepl',
      hotelName,
      hotelStars: Math.min(5, Math.max(1, Number(raw.category ?? 4))) || 4,
      hotelLocation: locationParts.join(', ') || countryName,
      destinationRaw: countryName,
      departureAirport: String(raw.departurePlaceCode ?? 'WAW').toUpperCase(),
      departureDate,
      returnDate,
      nights,
      boardType: parseBoardType(String(raw.serviceDesc ?? '')),
      priceTotal,
      pricePerPerson: adults > 0 ? Math.round(priceTotal / adults) : priceTotal,
      currency: 'PLN',
      adults,
      children: Number(raw.children ?? 0),
      tourOperator: String(raw.tourOperatorName ?? ''),
      sourceUrl,
    };
  } catch {
    return null;
  }
}

// --- HTML Parser ---

function parseHtml(html: string, slug: string, sourceUrl: string): WakacjePlLiveOffer[] {
  const match = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];

  let nextData: unknown;
  try {
    nextData = JSON.parse(match[1]!);
  } catch {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = nextData as any;
  const rawOffers: unknown[] =
    d?.props?.stores?.storeOffers?.offers?.data ??
    d?.props?.pageProps?.offers ??
    [];

  if (!Array.isArray(rawOffers)) return [];

  return rawOffers
    .map((raw) => mapOffer(raw, slug, sourceUrl))
    .filter((o): o is WakacjePlLiveOffer => o !== null);
}

// --- Per-destination fetch (multi-page) ---

const LIVE_PAGE_COUNT = 4; // fetch 4 pages = ~40 offers per destination

function buildPageUrl(slug: string, page: number): string {
  return page === 1
    ? `${BASE_URL}/${slug}/?all-inclusive&src=fromFilters`
    : `${BASE_URL}/${slug}/strona/${page}/?all-inclusive&src=fromFilters`;
}

async function searchWakacjePlDestination(
  canonical: string,
): Promise<{ offers: WakacjePlLiveOffer[]; error?: string }> {
  const slug = DEST_MAP[canonical];
  if (!slug) return { offers: [], error: `Unknown destination: ${canonical}` };

  const urls = Array.from({ length: LIVE_PAGE_COUNT }, (_, i) => buildPageUrl(slug, i + 1));

  try {
    const results = await Promise.allSettled(urls.map((u) => fetchHtml(u)));

    const seen = new Set<string>();
    const offers: WakacjePlLiveOffer[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i]!;
      if (res.status !== 'fulfilled') continue;
      for (const offer of parseHtml(res.value, slug, urls[i]!)) {
        const key = `${offer.hotelName}|${offer.departureDate}|${offer.priceTotal}`;
        if (!seen.has(key)) {
          seen.add(key);
          offers.push(offer);
        }
      }
    }

    return { offers };
  } catch (err) {
    return { offers: [], error: String(err) };
  }
}

/**
 * Search all requested destinations in parallel, yielding as each completes.
 * Returns results for destinations that have a wakacje.pl slug mapping.
 */
export async function* searchWakacjePlLive(
  destinations: string[],
): AsyncGenerator<{ destination: string; offers: WakacjePlLiveOffer[]; error?: string }> {
  const dests = destinations.filter((d) => DEST_MAP[d]);
  if (dests.length === 0) return;

  const pending = new Map(
    dests.map((dest, i) => [
      i,
      searchWakacjePlDestination(dest).then((r) => ({ i, dest, ...r })),
    ]),
  );

  while (pending.size > 0) {
    const { i, dest, offers, error } = await Promise.race(pending.values());
    pending.delete(i);
    yield { destination: dest, offers, error };
  }
}
