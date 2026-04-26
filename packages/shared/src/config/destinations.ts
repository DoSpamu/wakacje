import type { CanonicalDestination } from '../types/filter.js';

export interface WakacjePlDestinationMapping {
  /** URL slug used in https://www.wakacje.pl/wczasy/{slug}/ */
  slug: string;
}

export interface DestinationInfo {
  canonical: CanonicalDestination;
  displayNamePl: string;
  countryCode: string;
  /** Provider-specific destination IDs/codes */
  providers: {
    rpl?: RplDestinationMapping;
    exim?: EximDestinationMapping;
    itaka?: ItakaDestinationMapping;
    grecos?: GrecosDestinationMapping;
    tui?: TuiDestinationMapping;
    wakacjepl?: WakacjePlDestinationMapping;
  };
}

export interface ItakaDestinationMapping {
  /** Itaka URL slug, e.g. 'turcja', 'grecja' */
  slug: string;
  displayName: string;
}

export interface GrecosDestinationMapping {
  /** Grecos query param value for country/destination */
  slug: string;
  displayName: string;
}

export interface TuiDestinationMapping {
  /** TUI internal destination code */
  code: string;
  displayName: string;
}

export interface RplDestinationMapping {
  /** URL param for kraj= */
  kraj?: string;
  /** URL param for region= */
  region?: string[];
  /** Display name on r.pl */
  displayName: string;
}

export interface EximDestinationMapping {
  /** Numeric destination IDs for Exim (to=ID1|ID2) */
  ids: number[];
  displayName: string;
}


/**
 * Master destination dictionary.
 * Each canonical destination maps to provider-specific identifiers.
 *
 * IMPORTANT: Verify Exim IDs against current Exim search UI before production use.
 * IDs can change with site redesigns. Run: node packages/scrapers/src/tools/discover-exim-ids.ts
 */
export const DESTINATIONS: Record<CanonicalDestination, DestinationInfo> = {
  turkey: {
    canonical: 'turkey',
    displayNamePl: 'Turcja',
    countryCode: 'TR',
    providers: {
      rpl: { kraj: 'turcja', displayName: 'Turcja' },
      // Exim IDs discovered 2026-04-10 from /kierunki/turcja (Antalya/Turkish Riviera)
      exim: { ids: [63288, 63448, 64157], displayName: 'Turcja' },
      itaka: { slug: 'turcja', displayName: 'Turcja' },
      grecos: { slug: 'turcja', displayName: 'Turcja' },
      tui: { code: 'turkey', displayName: 'Turcja' },
      wakacjepl: { slug: 'turcja' },
    },
  },
  egypt: {
    canonical: 'egypt',
    displayNamePl: 'Egipt',
    countryCode: 'EG',
    providers: {
      rpl: { kraj: 'egipt', displayName: 'Egipt' },
      // Exim IDs discovered 2026-04-10 from /all-inclusive page
      exim: { ids: [64419, 64420, 64425], displayName: 'Egipt' },
      itaka: { slug: 'egipt', displayName: 'Egipt' },
      grecos: { slug: 'egipt', displayName: 'Egipt' },
      tui: { code: 'egypt', displayName: 'Egipt' },
      wakacjepl: { slug: 'egipt' },
    },
  },
  greece: {
    canonical: 'greece',
    displayNamePl: 'Grecja',
    countryCode: 'GR',
    providers: {
      rpl: { kraj: 'grecja', displayName: 'Grecja' },
      // Exim IDs discovered 2026-04-10 from /all-inclusive page
      exim: { ids: [63220, 63281, 63316, 63324, 63402], displayName: 'Grecja' },
      itaka: { slug: 'grecja', displayName: 'Grecja' },
      grecos: { slug: 'grecja', displayName: 'Grecja' },
      tui: { code: 'greece', displayName: 'Grecja' },
      wakacjepl: { slug: 'grecja' },
    },
  },
  spain: {
    canonical: 'spain',
    displayNamePl: 'Hiszpania',
    countryCode: 'ES',
    providers: {
      rpl: { kraj: 'hiszpania', displayName: 'Hiszpania' },
      // Exim IDs discovered 2026-04-10 from /all-inclusive page (incl. Canary Islands)
      exim: { ids: [63213, 63241, 63242, 63243, 63245, 63284, 63350, 74459, 74460, 74465], displayName: 'Hiszpania' },
      itaka: { slug: 'hiszpania', displayName: 'Hiszpania' },
      grecos: { slug: 'hiszpania', displayName: 'Hiszpania' },
      tui: { code: 'spain', displayName: 'Hiszpania' },
      wakacjepl: { slug: 'hiszpania' },
    },
  },
  cyprus: {
    canonical: 'cyprus',
    displayNamePl: 'Cypr',
    countryCode: 'CY',
    providers: {
      rpl: { kraj: 'cypr', displayName: 'Cypr' },
      // Exim IDs discovered 2026-04-10 from /all-inclusive page
      exim: { ids: [63540, 63541, 63542], displayName: 'Cypr' },
      itaka: { slug: 'cypr', displayName: 'Cypr' },
      grecos: { slug: 'cypr', displayName: 'Cypr' },
      tui: { code: 'cyprus', displayName: 'Cypr' },
      wakacjepl: { slug: 'cypr' },
    },
  },
  tunisia: {
    canonical: 'tunisia',
    displayNamePl: 'Tunezja',
    countryCode: 'TN',
    providers: {
      rpl: { kraj: 'tunezja', displayName: 'Tunezja' },
      exim: { ids: [1501, 1502, 1503], displayName: 'Tunezja' },
      itaka: { slug: 'tunezja', displayName: 'Tunezja' },
      grecos: { slug: 'tunezja', displayName: 'Tunezja' },
      tui: { code: 'tunisia', displayName: 'Tunezja' },
      wakacjepl: { slug: 'tunezja' },
    },
  },
  bulgaria: {
    canonical: 'bulgaria',
    displayNamePl: 'BuĹ‚garia',
    countryCode: 'BG',
    providers: {
      rpl: { kraj: 'bulgaria', displayName: 'BuĹ‚garia' },
      exim: { ids: [1401, 1402], displayName: 'BuĹ‚garia' },
      itaka: { slug: 'bulgaria', displayName: 'BuĹ‚garia' },
      grecos: { slug: 'bulgaria', displayName: 'BuĹ‚garia' },
      tui: { code: 'bulgaria', displayName: 'BuĹ‚garia' },
      wakacjepl: { slug: 'bulgaria' },
    },
  },
  croatia: {
    canonical: 'croatia',
    displayNamePl: 'Chorwacja',
    countryCode: 'HR',
    providers: {
      rpl: { kraj: 'chorwacja', displayName: 'Chorwacja' },
      exim: { ids: [1301, 1302, 1303], displayName: 'Chorwacja' },
      itaka: { slug: 'chorwacja', displayName: 'Chorwacja' },
      grecos: { slug: 'chorwacja', displayName: 'Chorwacja' },
      tui: { code: 'croatia', displayName: 'Chorwacja' },
      wakacjepl: { slug: 'chorwacja' },
    },
  },
  malta: {
    canonical: 'malta',
    displayNamePl: 'Malta',
    countryCode: 'MT',
    providers: {
      rpl: { kraj: 'malta', displayName: 'Malta' },
      exim: { ids: [1201], displayName: 'Malta' },
      itaka: { slug: 'malta', displayName: 'Malta' },
      grecos: { slug: 'malta', displayName: 'Malta' },
      tui: { code: 'malta', displayName: 'Malta' },
      wakacjepl: { slug: 'malta' },
    },
  },
  'canary-islands': {
    canonical: 'canary-islands',
    displayNamePl: 'Wyspy Kanaryjskie',
    countryCode: 'ES',
    providers: {
      rpl: { kraj: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      exim: { ids: [1101, 1102, 1103, 1104], displayName: 'Wyspy Kanaryjskie' },
      itaka: { slug: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      grecos: { slug: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      tui: { code: 'canary-islands', displayName: 'Wyspy Kanaryjskie' },
      wakacjepl: { slug: 'wyspy-kanaryjskie' },
    },
  },
  portugal: {
    canonical: 'portugal',
    displayNamePl: 'Portugalia',
    countryCode: 'PT',
    providers: {
      rpl: { kraj: 'portugalia', displayName: 'Portugalia' },
      exim: { ids: [1001, 1002], displayName: 'Portugalia' },
      itaka: { slug: 'portugalia', displayName: 'Portugalia' },
      grecos: { slug: 'portugalia', displayName: 'Portugalia' },
      tui: { code: 'portugal', displayName: 'Portugalia' },
      wakacjepl: { slug: 'portugalia' },
    },
  },
  morocco: {
    canonical: 'morocco',
    displayNamePl: 'Maroko',
    countryCode: 'MA',
    providers: {
      rpl: { kraj: 'maroko', displayName: 'Maroko' },
      exim: { ids: [901, 902], displayName: 'Maroko' },
      itaka: { slug: 'maroko', displayName: 'Maroko' },
      grecos: { slug: 'maroko', displayName: 'Maroko' },
      tui: { code: 'morocco', displayName: 'Maroko' },
      wakacjepl: { slug: 'maroko' },
    },
  },
  albania: {
    canonical: 'albania',
    displayNamePl: 'Albania',
    countryCode: 'AL',
    providers: {
      rpl: { kraj: 'albania', displayName: 'Albania' },
      exim: { ids: [801], displayName: 'Albania' },
      itaka: { slug: 'albania', displayName: 'Albania' },
      grecos: { slug: 'albania', displayName: 'Albania' },
      tui: { code: 'albania', displayName: 'Albania' },
      wakacjepl: { slug: 'albania' },
    },
  },
  montenegro: {
    canonical: 'montenegro',
    displayNamePl: 'CzarnogĂłra',
    countryCode: 'ME',
    providers: {
      rpl: { kraj: 'czarnogora', displayName: 'CzarnogĂłra' },
      exim: { ids: [701, 702], displayName: 'CzarnogĂłra' },
      itaka: { slug: 'czarnogora', displayName: 'CzarnogĂłra' },
      grecos: { slug: 'czarnogora', displayName: 'CzarnogĂłra' },
      tui: { code: 'montenegro', displayName: 'CzarnogĂłra' },
      wakacjepl: { slug: 'czarnogora' },
    },
  },
};

/** Lookup by canonical key */
export function getDestination(canonical: CanonicalDestination): DestinationInfo {
  return DESTINATIONS[canonical];
}

/** All canonical destination keys */
export const ALL_DESTINATION_KEYS = Object.keys(DESTINATIONS) as CanonicalDestination[];

/** Get display name in Polish for a canonical destination */
export function getDestinationDisplayName(canonical: CanonicalDestination): string {
  return DESTINATIONS[canonical].displayNamePl;
}
