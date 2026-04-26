/**
 * Wakacje.pl offer parser — pure functions, no browser dependency.
 *
 * wakacje.pl is an aggregator: one offer record includes tourOperatorName,
 * so a single scraper covers ~35 tour operators (incl. Coral Travel).
 *
 * Data shape from __NEXT_DATA__ → props.stores.storeOffers.offers.data:
 * {
 *   id, name, placeName, hotelId, offerId, category (stars),
 *   price (total), departureDate, returnDate, duration, durationNights,
 *   departurePlaceCode (IATA), serviceDesc, tourOperatorName, ratingValue,
 *   place: { country: { id, name, slug }, region: { name }, city: { name } }
 * }
 */

import type { RawOffer } from '@wakacje/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export function parseWakacjePlBoardType(serviceDesc: string): RawOffer['boardType'] {
  const s = serviceDesc.toLowerCase();
  if (s.includes('ultra all') || s.includes('ultra-all')) return 'ultra-all-inclusive';
  if (s.includes('all inclusive') || s.includes('all-inclusive')) return 'all-inclusive';
  if (s.includes('half board') || s.includes('hb') || s.includes('półpensja')) return 'half-board';
  if (s.includes('full board') || s.includes('fb') || s.includes('pełne wyżywienie')) return 'full-board';
  if (s.includes('śniadanie') || s.includes('breakfast') || s.includes('bb')) return 'bed-and-breakfast';
  if (s.includes('bez wyżywienia') || s.includes('room only') || s.includes('ro')) return 'room-only';
  return 'unknown';
}

/** Build hotel location string from place object */
function buildHotelLocation(place: AnyObj): string {
  const parts: string[] = [];
  if (place?.city?.name) parts.push(place.city.name);
  if (place?.region?.name && place.region.name !== place?.city?.name) parts.push(place.region.name);
  if (place?.country?.name) parts.push(place.country.name);
  return parts.join(', ') || 'Nieznana lokalizacja';
}

/** Compute return date from departure + nights if returnDate missing */
function computeReturnDate(departureDate: string, nights: number): string {
  try {
    const d = new Date(departureDate);
    d.setDate(d.getDate() + nights);
    return d.toISOString().split('T')[0]!;
  } catch {
    return departureDate;
  }
}

/** Parse a single raw offer object from wakacje.pl __NEXT_DATA__ */
export function parseWakacjePlOffer(raw: AnyObj, sourceUrl: string): RawOffer | null {
  try {
    const hotelName = String(raw.name ?? '').trim();
    if (!hotelName) return null;

    const price = Number(raw.price ?? 0);
    if (price <= 0) return null;

    const nights = Number(raw.durationNights ?? raw.duration ?? 7);
    const departureDate = String(raw.departureDate ?? '').slice(0, 10);
    if (!departureDate) return null;

    const returnDate = raw.returnDate
      ? String(raw.returnDate).slice(0, 10)
      : computeReturnDate(departureDate, nights);

    const place: AnyObj = raw.place ?? {};
    const destinationRaw = place?.country?.name ?? String(raw.placeName ?? '').split('/')[0]?.trim() ?? '';
    const hotelLocation = buildHotelLocation(place);

    const adults = Number(raw.adults ?? 2);
    const priceTotal = price;
    const pricePerPerson = adults > 0 ? Math.round(priceTotal / adults) : priceTotal;

    const offer: RawOffer = {
      providerCode: 'wakacjepl',
      providerOfferId: String(raw.offerId ?? raw.id ?? ''),
      hotelName,
      hotelStars: (Math.min(5, Math.max(1, Number(raw.category ?? 4))) || 4) as RawOffer['hotelStars'],
      hotelLocation,
      destinationRaw,
      departureAirport: String(raw.departurePlaceCode ?? 'WAW').toUpperCase(),
      departureDate,
      returnDate,
      nights,
      boardType: parseWakacjePlBoardType(String(raw.serviceDesc ?? '')),
      priceTotal,
      pricePerPerson,
      currency: 'PLN',
      adults,
      children: Number(raw.children ?? 0),
      sourceUrl,
    };

    return offer;
  } catch {
    return null;
  }
}

/** Extract all offers from wakacje.pl __NEXT_DATA__ JSON */
export function parseWakacjePlNextData(data: unknown, sourceUrl: string): RawOffer[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  try {
    const rawOffers: AnyObj[] =
      d?.props?.stores?.storeOffers?.offers?.data ??
      d?.props?.pageProps?.offers ??
      [];

    if (!Array.isArray(rawOffers)) return [];

    return rawOffers
      .map((raw) => parseWakacjePlOffer(raw, sourceUrl))
      .filter((o): o is RawOffer => o !== null);
  } catch {
    return [];
  }
}
