import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTuiJsonLdItems,
  parseTuiWindowStateData,
  parseTuiOfferCode,
  parseTuiPrice,
  parseTuiStars,
  parseTuiNights,
  parseTuiBoardType,
  parseTuiDate,
  parseTuiAirport,
} from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/jsonld-items.json'), 'utf-8')
);

describe('parseTuiOfferCode', () => {
  // Code: KTWJGA20260601060020260601202606080800L07VRN85058APX1AI02
  //       slice(0,3)="KTW"  slice(6,14)="20260601"  slice(26,34)="20260608"  slice(39,41)="07"
  const url = 'https://www.tui.pl/wypoczynek/turcja/kemer/amara/KTW/OfferCodeWS/KTWJGA20260601060020260601202606080800L07VRN85058APX1AI02';

  it('extracts departure airport', () => {
    expect(parseTuiOfferCode(url)?.depAirport).toBe('KTW');
  });

  it('extracts departure date', () => {
    expect(parseTuiOfferCode(url)?.depDate).toBe('2026-06-01');
  });

  it('extracts return date', () => {
    expect(parseTuiOfferCode(url)?.retDate).toBe('2026-06-08');
  });

  it('extracts nights', () => {
    expect(parseTuiOfferCode(url)?.nights).toBe(7);
  });

  it('returns null for URL without OfferCodeWS', () => {
    expect(parseTuiOfferCode('https://www.tui.pl/wypoczynek/turcja')).toBeNull();
  });

  it('returns null for too-short code', () => {
    expect(parseTuiOfferCode('https://www.tui.pl/OfferCodeWS/KTWJGA')).toBeNull();
  });
});

describe('parseTuiJsonLdItems', () => {
  it('extracts 3 offers from fixture', () => {
    const offers = parseTuiJsonLdItems(fixture);
    expect(offers).toHaveLength(3);
  });

  it('maps first offer hotel name and destination', () => {
    const [offer] = parseTuiJsonLdItems(fixture);
    expect(offer!.providerCode).toBe('tui');
    expect(offer!.hotelName).toBe('Amara Family Resort');
    expect(offer!.destinationRaw).toBe('turcja');
    expect(offer!.departureAirport).toBe('KTW');
    expect(offer!.departureDate).toBe('2026-06-01');
    expect(offer!.returnDate).toBe('2026-06-08');
    expect(offer!.nights).toBe(7);
    expect(offer!.boardType).toBe('all-inclusive');
  });

  it('maps half-board offer from third item', () => {
    const offers = parseTuiJsonLdItems(fixture);
    expect(offers[2]!.boardType).toBe('half-board');
    expect(offers[2]!.nights).toBe(11);
    expect(offers[2]!.departureAirport).toBe('KRK');
  });

  it('returns empty array for empty input', () => {
    expect(parseTuiJsonLdItems([])).toEqual([]);
  });

  it('skips items without name or url', () => {
    const bad = [{ '@type': 'ItemList', itemListElement: [{ name: '', url: '' }] }];
    expect(parseTuiJsonLdItems(bad)).toEqual([]);
  });
});

describe('parseTuiWindowStateData', () => {
  it('extracts offers from window state shape', () => {
    const state = {
      offers: [
        {
          id: 'tui-ws-001',
          hotelName: 'Rixos Premium',
          stars: 5,
          location: 'Belek',
          country: 'Turcja',
          departureAirport: 'KTW',
          departureDate: '2026-06-01',
          nights: 7,
          boardType: 'all-inclusive',
          price: 4999,
          adults: 2,
        },
      ],
    };
    const offers = parseTuiWindowStateData(state);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.hotelName).toBe('Rixos Premium');
    expect(offers[0]!.priceTotal).toBe(4999);
  });

  it('returns empty for null/invalid data', () => {
    expect(parseTuiWindowStateData(null)).toEqual([]);
    expect(parseTuiWindowStateData({ noOffers: true })).toEqual([]);
  });

  it('filters out zero-price offers', () => {
    const state = { offers: [{ hotelName: 'Test', price: 0 }] };
    expect(parseTuiWindowStateData(state)).toEqual([]);
  });
});

describe('parseTuiPrice', () => {
  it('parses "4 999 zł"', () => expect(parseTuiPrice('4 999 zł')).toBe(4999));
  it('returns 0 for empty', () => expect(parseTuiPrice('')).toBe(0));
});

describe('parseTuiStars', () => {
  it('parses "5"', () => expect(parseTuiStars('5')).toBe(5));
  it('caps at 5 for "6"', () => expect(parseTuiStars('6')).toBe(5));
  it('falls back to 4', () => expect(parseTuiStars('none')).toBe(4));
});

describe('parseTuiNights', () => {
  it('parses "7 nights"', () => expect(parseTuiNights('7 nights')).toBe(7));
  it('falls back to 7', () => expect(parseTuiNights('')).toBe(7));
});

describe('parseTuiBoardType', () => {
  it.each([
    ['all inclusive', 'all-inclusive'],
    ['GT06-XX', 'ultra-all-inclusive'],
    ['GT06-HB', 'half-board'],
    ['GT06-FB', 'full-board'],
    ['GT06-BB', 'bed-and-breakfast'],
    ['GT06-RO', 'room-only'],
  ] as const)('parses "%s"', (raw, expected) => {
    expect(parseTuiBoardType(raw)).toBe(expected);
  });
});

describe('parseTuiDate', () => {
  it('parses DD.MM.YYYY', () => expect(parseTuiDate('01.06.2026')).toBe('2026-06-01'));
  it('passes ISO date', () => expect(parseTuiDate('2026-06-01')).toBe('2026-06-01'));
});

describe('parseTuiAirport', () => {
  it('extracts "(KTW)"', () => expect(parseTuiAirport('Katowice (KTW)')).toBe('KTW'));
  it('maps "Katowice"', () => expect(parseTuiAirport('Katowice')).toBe('KTW'));
  it('extracts bare IATA', () => expect(parseTuiAirport('KRK')).toBe('KRK'));
});
