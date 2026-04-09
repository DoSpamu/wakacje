/**
 * Offer Normalizer
 *
 * Converts RawOffer (provider-specific) into a normalized Offer
 * ready for database insertion.
 */

import type { RawOffer, CanonicalDestination, BoardType } from '@wakacje/shared';
import { normalizeBoardType } from './HotelNormalizer.js';
import { logger } from '../base/logger.js';

/** Maps raw destination strings to canonical destination keys */
const DESTINATION_KEYWORD_MAP: Array<[RegExp, CanonicalDestination]> = [
  [/turcj|turk|turkey|antalya|alanya|bodrum|side|belek|marmaris|kusadasi|fethiye|kemer/i, 'turkey'],
  [/egipt|egypt|hurghad|sharm|marsa\s*alam|dahab/i, 'egypt'],
  [/grecj|greece|kreta|crete|rodos|rhodes|korfu|corfu|zakynthos|mykonos|santorini|halkidiki/i, 'greece'],
  [/hiszpani|spain|majorka|mallorca|costa\s*brava|costa\s*del\s*sol|tenerife|lanzarote|gran\s*canaria/i, 'spain'],
  [/cypr|cyprus|limassol|paphos|larnaca|ayia\s*napa/i, 'cyprus'],
  [/tunezj|tunisia|djerba|hammamet|sousse|monastir/i, 'tunisia'],
  [/bulgari|bulgaria|słoneczny brzeg|sunny beach|złote piaski|golden sands/i, 'bulgaria'],
  [/chorwacj|croatia|dubrovnik|split|hvar|zadar|pula/i, 'croatia'],
  [/malta|valletta|gozo/i, 'malta'],
  [/kanary|canary|wyspy kanaryjskie|lanzarote|fuerteventura|gran canaria/i, 'canary-islands'],
  [/portugali|portugal|algarve|lizbona|lisbon/i, 'portugal'],
  [/maroko|morocco|marrakech|agadir/i, 'morocco'],
  [/albani|albania|durres|sarande/i, 'albania'],
  [/czarnogór|montenegro|budva|kotor/i, 'montenegro'],
];

export function inferCanonicalDestination(raw: string): CanonicalDestination | null {
  for (const [pattern, canonical] of DESTINATION_KEYWORD_MAP) {
    if (pattern.test(raw)) return canonical;
  }
  return null;
}

export function normalizeAirportCode(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  const nameMap: Record<string, string> = {
    KATOWICE: 'KTW', PYRZOWICE: 'KTW',
    KRAKOW: 'KRK', KRAKÓW: 'KRK', BALICE: 'KRK',
    WARSZAWA: 'WAW', WARSAW: 'WAW', CHOPIN: 'WAW',
    GDANSK: 'GDN', GDAŃSK: 'GDN',
    POZNAN: 'POZ', POZNAŃ: 'POZ',
    WROCLAW: 'WRO', WROCŁAW: 'WRO',
    RZESZOW: 'RZE', RZESZÓW: 'RZE',
  };

  for (const [name, code] of Object.entries(nameMap)) {
    if (upper.includes(name)) return code;
  }
  return upper || 'KTW';
}

export function normalizePrice(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export interface NormalizedOfferInput {
  rawOffer: RawOffer;
  searchRunId: string;
  providerId: string;
  hotelId: string | null;
  destinationId: string | null;
}

export interface NormalizedOffer {
  searchRunId: string;
  providerId: string;
  providerCode: string;
  hotelId: string | null;
  providerOfferId: string | null;
  destinationId: string | null;
  departureAirport: string;
  departureDate: string;
  returnDate: string;
  nights: number;
  hotelName: string;
  hotelStars: number;
  hotelLocation: string;
  boardType: BoardType;
  roomType: string | null;
  priceTotal: number;
  pricePerPerson: number;
  currency: string;
  adults: number;
  children: number;
  sourceUrl: string;
  rawData: Record<string, unknown> | null;
  isAvailable: boolean;
  scrapedAt: string;
}

export function normalizeOffer(input: NormalizedOfferInput): NormalizedOffer | null {
  const { rawOffer, searchRunId, providerId, hotelId, destinationId } = input;

  try {
    const priceTotal = normalizePrice(rawOffer.priceTotal);
    if (!priceTotal || priceTotal < 100) {
      logger.warn(`Skipping offer with invalid price: ${String(rawOffer.priceTotal)}`);
      return null;
    }

    const pricePerPerson = rawOffer.pricePerPerson
      ? normalizePrice(rawOffer.pricePerPerson)
      : Math.round(priceTotal / Math.max(1, rawOffer.adults ?? 2));

    const boardType = normalizeBoardType(rawOffer.boardType);
    const departureAirport = normalizeAirportCode(rawOffer.departureAirport);

    let returnDate = rawOffer.returnDate;
    if (!returnDate && rawOffer.departureDate && rawOffer.nights) {
      const depDate = new Date(rawOffer.departureDate);
      depDate.setDate(depDate.getDate() + rawOffer.nights);
      returnDate = depDate.toISOString().split('T')[0]!;
    }

    return {
      searchRunId,
      providerId,
      providerCode: rawOffer.providerCode,
      hotelId,
      providerOfferId: rawOffer.providerOfferId ?? null,
      destinationId,
      departureAirport,
      departureDate: rawOffer.departureDate,
      returnDate: returnDate ?? rawOffer.departureDate,
      nights: rawOffer.nights,
      hotelName: rawOffer.hotelName.trim(),
      hotelStars: Math.min(5, Math.max(1, rawOffer.hotelStars)),
      hotelLocation: rawOffer.hotelLocation,
      boardType,
      roomType: rawOffer.roomType ?? null,
      priceTotal,
      pricePerPerson,
      currency: rawOffer.currency ?? 'PLN',
      adults: rawOffer.adults ?? 2,
      children: rawOffer.children ?? 0,
      sourceUrl: rawOffer.sourceUrl,
      rawData: rawOffer.rawData ?? null,
      isAvailable: true,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('Failed to normalize offer', {
      error: String(err),
      hotel: rawOffer.hotelName,
    });
    return null;
  }
}
