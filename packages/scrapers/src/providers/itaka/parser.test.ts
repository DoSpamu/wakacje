import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseItakaApiResponse,
  parseItakaPrice,
  parseItakaStars,
  parseItakaNights,
  parseItakaBoardType,
  parseItakaDate,
  parseItakaAirport,
} from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/api-response.json'), 'utf-8')
);

describe('parseItakaApiResponse', () => {
  it('extracts 2 offers from pageProps fixture', () => {
    const offers = parseItakaApiResponse(fixture);
    expect(offers).toHaveLength(2);
  });

  it('maps first offer correctly', () => {
    const [offer] = parseItakaApiResponse(fixture);
    expect(offer!.providerCode).toBe('itaka');
    expect(offer!.hotelName).toBe('Amara Family Resort');
    expect(offer!.hotelStars).toBe(5);
    expect(offer!.boardType).toBe('all-inclusive');
    expect(offer!.departureDate).toBe('2026-06-01');
    expect(offer!.returnDate).toBe('2026-06-08');
    expect(offer!.nights).toBe(7);
    // Prices are divided by 100 (grosze → PLN)
    expect(offer!.priceTotal).toBe(3499);
    expect(offer!.departureAirport).toBe('KTW');
  });

  it('maps second offer as ultra-all-inclusive', () => {
    const offers = parseItakaApiResponse(fixture);
    expect(offers[1]!.boardType).toBe('ultra-all-inclusive');
    expect(offers[1]!.nights).toBe(10);
  });

  it('returns empty for null input', () => {
    expect(parseItakaApiResponse(null)).toEqual([]);
    expect(parseItakaApiResponse('garbage')).toEqual([]);
    expect(parseItakaApiResponse({})).toEqual([]);
  });

  it('handles direct main.rates.list format', () => {
    const direct = {
      main: { rates: { list: fixture.pageProps.initialQueryState.queries[0].state.data.main.rates.list } },
    };
    const offers = parseItakaApiResponse(direct);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]!.providerCode).toBe('itaka');
  });
});

describe('parseItakaPrice', () => {
  it('parses "3 299 PLN"', () => expect(parseItakaPrice('3 299 PLN')).toBe(3299));
  it('returns 0 for empty', () => expect(parseItakaPrice('')).toBe(0));
});

describe('parseItakaStars', () => {
  it('parses "5"', () => expect(parseItakaStars('5')).toBe(5));
  it('caps at 5', () => expect(parseItakaStars('6')).toBe(5));
});

describe('parseItakaNights', () => {
  it('parses "7 nocy"', () => expect(parseItakaNights('7 nocy')).toBe(7));
  it('parses plain "14"', () => expect(parseItakaNights('14')).toBe(14));
});

describe('parseItakaBoardType', () => {
  it.each([
    ['All Inclusive', 'all-inclusive'],
    ['UAI', 'ultra-all-inclusive'],
    ['HB', 'half-board'],
    ['FB', 'full-board'],
    ['BB', 'bed-and-breakfast'],
    ['RO', 'room-only'],
  ] as const)('parses "%s"', (raw, expected) => {
    expect(parseItakaBoardType(raw)).toBe(expected);
  });
});

describe('parseItakaDate', () => {
  it('parses "9.04.2026"', () => expect(parseItakaDate('9.04.2026')).toBe('2026-04-09'));
  it('parses "09.06.2026"', () => expect(parseItakaDate('09.06.2026')).toBe('2026-06-09'));
  it('passes ISO date through', () => expect(parseItakaDate('2026-06-09')).toBe('2026-06-09'));
});

describe('parseItakaAirport', () => {
  it('extracts "(KTW)" code', () => expect(parseItakaAirport('Katowice (KTW)')).toBe('KTW'));
  it('maps "Katowice"', () => expect(parseItakaAirport('Katowice')).toBe('KTW'));
  it('maps "Kraków"', () => expect(parseItakaAirport('Kraków')).toBe('KRK'));
});
