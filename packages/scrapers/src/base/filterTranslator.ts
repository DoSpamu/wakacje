/**
 * Filter Translator
 *
 * Converts canonical SearchFilter into provider-specific URL parameters.
 * Each provider has its own mapping logic.
 *
 * To add a new provider: implement a new translate*Filter function and export it.
 */

import type { SearchFilter, BoardType } from '@wakacje/shared';
import { DESTINATIONS } from '@wakacje/shared';

// ─────────────────────────────────────────────
//  R.pl
// ─────────────────────────────────────────────

/** R.pl hotel stars encoding: 4★ = 8, 5★ = 10, 3★ = 6 */
const RPL_STARS_MAP: Record<number, number> = { 3: 6, 4: 8, 5: 10 };

/** R.pl board type mapping */
const RPL_BOARD_MAP: Record<BoardType, string | null> = {
  'all-inclusive': 'all-inclusive',
  'ultra-all-inclusive': 'all-inclusive',
  'half-board': 'half-board',
  'full-board': 'full-board',
  'bed-and-breakfast': 'breakfast',
  'room-only': 'without-meals',
  'unknown': null,
};

/**
 * Generate adult birth date parameters for R.pl.
 * R.pl uses birth dates (YYYY-MM-DD) for each adult passenger.
 * We use a fixed reference year to produce adults of ~30 years old.
 */
function rplAdultBirthDates(count: number): string[] {
  const refYear = new Date().getFullYear() - 30;
  const refDate = `${refYear}-04-09`;
  return Array(count).fill(refDate) as string[];
}

export interface RplSearchParams {
  baseUrl: string;
  params: URLSearchParams;
}

export function translateToRpl(filter: SearchFilter): RplSearchParams[] {
  const results: RplSearchParams[] = [];
  const baseUrl = 'https://r.pl/szukaj';

  for (const destination of filter.destinations) {
    const destInfo = DESTINATIONS[destination];
    const rplDest = destInfo.providers.rpl;

    if (!rplDest) continue;

    const params = new URLSearchParams();

    // Departure airports (can be multiple)
    for (const airport of filter.departureAirports) {
      params.append('wybraneSkad', airport);
    }

    // Transport type
    params.set('typTransportu', 'AIR');

    // Adults (as birth date params)
    for (const birthDate of rplAdultBirthDates(filter.adults)) {
      params.append('dorosli', birthDate);
    }

    // Children
    params.set('dzieci', filter.children > 0 ? filter.children.toString() : 'nie');

    // Rooms
    params.set('liczbaPokoi', '1');
    params.set('dowolnaLiczbaPokoi', 'nie');

    // Destination
    if (rplDest.kraj) {
      params.set('kraj', rplDest.kraj);
    }

    // Board types
    const rplBoards = filter.boardTypes
      .map((b) => RPL_BOARD_MAP[b])
      .filter((b): b is string => b !== null);

    if (rplBoards.length > 0) {
      params.set('wyzywienia', rplBoards[0]!);
    }

    // Nights
    params.set('dlugoscPobytu', `${filter.nights.min}-${filter.nights.max}`);

    // Hotel stars (can be multiple)
    for (const stars of filter.hotelStars) {
      const rplStars = RPL_STARS_MAP[stars];
      if (rplStars) params.append('standardHotelu', rplStars.toString());
    }

    // Departure date range — R.pl uses dataWylotu param
    if (filter.departureDateFrom) {
      params.set('dataWylotu', filter.departureDateFrom);
    }

    // Price filter
    if (filter.priceMin) params.set('cena.od', filter.priceMin.toString());
    if (filter.priceMax) params.set('cena.do', filter.priceMax.toString());
    params.set('cena', 'avg');

    params.set('sortowanie', 'rekomendowane-biznes-desc');

    results.push({ baseUrl, params });
  }

  return results;
}

// ─────────────────────────────────────────────
//  Exim Tours
// ─────────────────────────────────────────────

/** Exim Tours board type mapping */
const EXIM_BOARD_MAP: Record<BoardType, string | null> = {
  'all-inclusive': 'AI',
  'ultra-all-inclusive': 'UAI',
  'half-board': 'HB',
  'full-board': 'FB',
  'bed-and-breakfast': 'BB',
  'room-only': 'RO',
  'unknown': null,
};

export interface EximSearchParams {
  baseUrl: string;
  params: URLSearchParams;
}

export function translateToExim(filter: SearchFilter): EximSearchParams[] {
  const results: EximSearchParams[] = [];
  const baseUrl = 'https://www.exim.pl/wyszukanie';

  // Collect all Exim destination IDs for requested destinations
  const destinationIds: number[] = [];
  for (const dest of filter.destinations) {
    const destInfo = DESTINATIONS[dest];
    if (destInfo.providers.exim) {
      destinationIds.push(...destInfo.providers.exim.ids);
    }
  }

  if (destinationIds.length === 0) return results;

  const params = new URLSearchParams();

  // Adults count
  params.set('ac1', filter.adults.toString());

  // Departure date from
  params.set('dd', filter.departureDateFrom);

  // Return date (end of search window)
  params.set('rd', filter.departureDateTo);

  // Nights — pipe-separated list
  const nightsList: number[] = [];
  for (let n = filter.nights.min; n <= filter.nights.max; n++) {
    nightsList.push(n);
  }
  params.set('nn', nightsList.join('|'));

  // Destinations — pipe-separated IDs
  params.set('to', destinationIds.join('|'));

  // Transport type: 1 = air
  params.set('tt', '1');

  // Departure airport (Exim uses 'df' param)
  if (filter.departureAirports.length > 0) {
    params.set('df', filter.departureAirports.join('|'));
  }

  // Board type
  const eximBoards = filter.boardTypes
    .map((b) => EXIM_BOARD_MAP[b])
    .filter((b): b is string => b !== null);

  if (eximBoards.length > 0) {
    params.set('bt', eximBoards.join('|'));
  }

  // Hotel category (stars) — Exim uses numeric: 4, 5
  if (filter.hotelStars.length > 0) {
    params.set('cat', filter.hotelStars.join('|'));
  }

  results.push({ baseUrl, params });
  return results;
}

// ─────────────────────────────────────────────
//  Coral Travel
// ─────────────────────────────────────────────

export interface CoralSearchParams {
  baseUrl: string;
  params: URLSearchParams;
}

export function translateToCoral(filter: SearchFilter): CoralSearchParams[] {
  const results: CoralSearchParams[] = [];
  const baseUrl = 'https://www.coraltravel.pl/wczasy';

  const coralSlugs: string[] = [];
  for (const dest of filter.destinations) {
    const destInfo = DESTINATIONS[dest];
    if (destInfo.providers.coral) {
      coralSlugs.push(...destInfo.providers.coral.slugs);
    }
  }

  if (coralSlugs.length === 0) return results;

  const params = new URLSearchParams();

  // Coral uses different param names — adjust after inspecting their search URL
  params.set('country', coralSlugs[0]!);
  params.set('from_city', filter.departureAirports.join(','));
  params.set('date_from', filter.departureDateFrom);
  params.set('date_to', filter.departureDateTo);
  params.set('nights_from', filter.nights.min.toString());
  params.set('nights_to', filter.nights.max.toString());
  params.set('adults', filter.adults.toString());
  params.set('stars', filter.hotelStars.join(','));

  results.push({ baseUrl, params });
  return results;
}
