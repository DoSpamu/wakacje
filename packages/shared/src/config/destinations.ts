import type { CanonicalDestination } from '../types/filter.js';

export interface DestinationInfo {
  canonical: CanonicalDestination;
  displayNamePl: string;
  countryCode: string;
  /** Provider-specific destination IDs/codes */
  providers: {
    rpl?: RplDestinationMapping;
    exim?: EximDestinationMapping;
    coral?: CoralDestinationMapping;
    itaka?: ItakaDestinationMapping;
    grecos?: GrecosDestinationMapping;
    tui?: TuiDestinationMapping;
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

export interface CoralDestinationMapping {
  /** Coral Travel URL slugs or IDs */
  slugs: string[];
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
      coral: { slugs: ['turcja', 'turkey'], displayName: 'Turcja' },
      itaka: { slug: 'turcja', displayName: 'Turcja' },
      grecos: { slug: 'turcja', displayName: 'Turcja' },
      tui: { code: 'turkey', displayName: 'Turcja' },
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
      coral: { slugs: ['egipt', 'egypt'], displayName: 'Egipt' },
      itaka: { slug: 'egipt', displayName: 'Egipt' },
      grecos: { slug: 'egipt', displayName: 'Egipt' },
      tui: { code: 'egypt', displayName: 'Egipt' },
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
      coral: { slugs: ['grecja', 'greece'], displayName: 'Grecja' },
      itaka: { slug: 'grecja', displayName: 'Grecja' },
      grecos: { slug: 'grecja', displayName: 'Grecja' },
      tui: { code: 'greece', displayName: 'Grecja' },
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
      coral: { slugs: ['hiszpania', 'spain'], displayName: 'Hiszpania' },
      itaka: { slug: 'hiszpania', displayName: 'Hiszpania' },
      grecos: { slug: 'hiszpania', displayName: 'Hiszpania' },
      tui: { code: 'spain', displayName: 'Hiszpania' },
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
      coral: { slugs: ['cypr', 'cyprus'], displayName: 'Cypr' },
      itaka: { slug: 'cypr', displayName: 'Cypr' },
      grecos: { slug: 'cypr', displayName: 'Cypr' },
      tui: { code: 'cyprus', displayName: 'Cypr' },
    },
  },
  tunisia: {
    canonical: 'tunisia',
    displayNamePl: 'Tunezja',
    countryCode: 'TN',
    providers: {
      rpl: { kraj: 'tunezja', displayName: 'Tunezja' },
      exim: { ids: [1501, 1502, 1503], displayName: 'Tunezja' },
      coral: { slugs: ['tunezja', 'tunisia'], displayName: 'Tunezja' },
      itaka: { slug: 'tunezja', displayName: 'Tunezja' },
      grecos: { slug: 'tunezja', displayName: 'Tunezja' },
      tui: { code: 'tunisia', displayName: 'Tunezja' },
    },
  },
  bulgaria: {
    canonical: 'bulgaria',
    displayNamePl: 'Bułgaria',
    countryCode: 'BG',
    providers: {
      rpl: { kraj: 'bulgaria', displayName: 'Bułgaria' },
      exim: { ids: [1401, 1402], displayName: 'Bułgaria' },
      coral: { slugs: ['bulgaria'], displayName: 'Bułgaria' },
      itaka: { slug: 'bulgaria', displayName: 'Bułgaria' },
      grecos: { slug: 'bulgaria', displayName: 'Bułgaria' },
      tui: { code: 'bulgaria', displayName: 'Bułgaria' },
    },
  },
  croatia: {
    canonical: 'croatia',
    displayNamePl: 'Chorwacja',
    countryCode: 'HR',
    providers: {
      rpl: { kraj: 'chorwacja', displayName: 'Chorwacja' },
      exim: { ids: [1301, 1302, 1303], displayName: 'Chorwacja' },
      coral: { slugs: ['chorwacja', 'croatia'], displayName: 'Chorwacja' },
      itaka: { slug: 'chorwacja', displayName: 'Chorwacja' },
      grecos: { slug: 'chorwacja', displayName: 'Chorwacja' },
      tui: { code: 'croatia', displayName: 'Chorwacja' },
    },
  },
  malta: {
    canonical: 'malta',
    displayNamePl: 'Malta',
    countryCode: 'MT',
    providers: {
      rpl: { kraj: 'malta', displayName: 'Malta' },
      exim: { ids: [1201], displayName: 'Malta' },
      coral: { slugs: ['malta'], displayName: 'Malta' },
      itaka: { slug: 'malta', displayName: 'Malta' },
      grecos: { slug: 'malta', displayName: 'Malta' },
      tui: { code: 'malta', displayName: 'Malta' },
    },
  },
  'canary-islands': {
    canonical: 'canary-islands',
    displayNamePl: 'Wyspy Kanaryjskie',
    countryCode: 'ES',
    providers: {
      rpl: { kraj: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      exim: { ids: [1101, 1102, 1103, 1104], displayName: 'Wyspy Kanaryjskie' },
      coral: { slugs: ['wyspy-kanaryjskie', 'canary-islands'], displayName: 'Wyspy Kanaryjskie' },
      itaka: { slug: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      grecos: { slug: 'wyspy-kanaryjskie', displayName: 'Wyspy Kanaryjskie' },
      tui: { code: 'canary-islands', displayName: 'Wyspy Kanaryjskie' },
    },
  },
  portugal: {
    canonical: 'portugal',
    displayNamePl: 'Portugalia',
    countryCode: 'PT',
    providers: {
      rpl: { kraj: 'portugalia', displayName: 'Portugalia' },
      exim: { ids: [1001, 1002], displayName: 'Portugalia' },
      coral: { slugs: ['portugalia', 'portugal'], displayName: 'Portugalia' },
      itaka: { slug: 'portugalia', displayName: 'Portugalia' },
      grecos: { slug: 'portugalia', displayName: 'Portugalia' },
      tui: { code: 'portugal', displayName: 'Portugalia' },
    },
  },
  morocco: {
    canonical: 'morocco',
    displayNamePl: 'Maroko',
    countryCode: 'MA',
    providers: {
      rpl: { kraj: 'maroko', displayName: 'Maroko' },
      exim: { ids: [901, 902], displayName: 'Maroko' },
      coral: { slugs: ['maroko', 'morocco'], displayName: 'Maroko' },
      itaka: { slug: 'maroko', displayName: 'Maroko' },
      grecos: { slug: 'maroko', displayName: 'Maroko' },
      tui: { code: 'morocco', displayName: 'Maroko' },
    },
  },
  albania: {
    canonical: 'albania',
    displayNamePl: 'Albania',
    countryCode: 'AL',
    providers: {
      rpl: { kraj: 'albania', displayName: 'Albania' },
      exim: { ids: [801], displayName: 'Albania' },
      coral: { slugs: ['albania'], displayName: 'Albania' },
      itaka: { slug: 'albania', displayName: 'Albania' },
      grecos: { slug: 'albania', displayName: 'Albania' },
      tui: { code: 'albania', displayName: 'Albania' },
    },
  },
  montenegro: {
    canonical: 'montenegro',
    displayNamePl: 'Czarnogóra',
    countryCode: 'ME',
    providers: {
      rpl: { kraj: 'czarnogora', displayName: 'Czarnogóra' },
      exim: { ids: [701, 702], displayName: 'Czarnogóra' },
      coral: { slugs: ['czarnogora', 'montenegro'], displayName: 'Czarnogóra' },
      itaka: { slug: 'czarnogora', displayName: 'Czarnogóra' },
      grecos: { slug: 'czarnogora', displayName: 'Czarnogóra' },
      tui: { code: 'montenegro', displayName: 'Czarnogóra' },
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
