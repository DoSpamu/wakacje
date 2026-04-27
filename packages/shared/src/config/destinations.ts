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
  /** Numeric destination IDs for Exim D= parameter */
  ids: number[];
  displayName: string;
}


/**
 * Master destination dictionary.
 * Exim IDs verified 2026-04-27 from live /kierunki/{slug} pages.
 * Exim uses uppercase D= parameter with country-level IDs.
 */
export const DESTINATIONS: Record<CanonicalDestination, DestinationInfo> = {
  turkey: {
    canonical: 'turkey',
    displayNamePl: 'Turcja',
    countryCode: 'TR',
    providers: {
      rpl: { kraj: 'turcja', displayName: 'Turcja' },
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
      exim: { ids: [424694], displayName: 'Egipt' },
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
      exim: { ids: [425856], displayName: 'Grecja' },
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
      exim: { ids: [446967], displayName: 'Hiszpania' },
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
      exim: { ids: [421341], displayName: 'Cypr' },
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
      exim: { ids: [421609], displayName: 'Tunezja' },
      itaka: { slug: 'tunezja', displayName: 'Tunezja' },
      grecos: { slug: 'tunezja', displayName: 'Tunezja' },
      tui: { code: 'tunisia', displayName: 'Tunezja' },
      wakacjepl: { slug: 'tunezja' },
    },
  },
  bulgaria: {
    canonical: 'bulgaria',
    displayNamePl: 'Bułgaria',
    countryCode: 'BG',
    providers: {
      rpl: { kraj: 'bulgaria', displayName: 'Bułgaria' },
      exim: { ids: [421022], displayName: 'Bułgaria' },
      itaka: { slug: 'bulgaria', displayName: 'Bułgaria' },
      grecos: { slug: 'bulgaria', displayName: 'Bułgaria' },
      tui: { code: 'bulgaria', displayName: 'Bułgaria' },
      wakacjepl: { slug: 'bulgaria' },
    },
  },
  croatia: {
    canonical: 'croatia',
    displayNamePl: 'Chorwacja',
    countryCode: 'HR',
    providers: {
      rpl: { kraj: 'chorwacja', displayName: 'Chorwacja' },
      exim: { ids: [421468], displayName: 'Chorwacja' },
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
      exim: { ids: [423882], displayName: 'Maroko' },
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
      itaka: { slug: 'albania', displayName: 'Albania' },
      grecos: { slug: 'albania', displayName: 'Albania' },
      tui: { code: 'albania', displayName: 'Albania' },
      wakacjepl: { slug: 'albania' },
    },
  },
  montenegro: {
    canonical: 'montenegro',
    displayNamePl: 'Czarnogóra',
    countryCode: 'ME',
    providers: {
      rpl: { kraj: 'czarnogora', displayName: 'Czarnogóra' },
      exim: { ids: [63487], displayName: 'Czarnogóra' },
      itaka: { slug: 'czarnogora', displayName: 'Czarnogóra' },
      grecos: { slug: 'czarnogora', displayName: 'Czarnogóra' },
      tui: { code: 'montenegro', displayName: 'Czarnogóra' },
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
