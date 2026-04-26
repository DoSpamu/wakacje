import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseEximApiResponse,
  parseEximPrice,
  parseEximStars,
  parseEximNights,
  parseEximBoardType,
  parseEximDate,
  parseEximAirport,
} from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/api-response.json'), 'utf-8')
);

describe('parseEximApiResponse', () => {
  it('extracts 2 offers from fixture', () => {
    const offers = parseEximApiResponse(fixture);
    expect(offers).toHaveLength(2);
  });

  it('maps first offer correctly', () => {
    const [offer] = parseEximApiResponse(fixture);
    expect(offer!.providerCode).toBe('exim');
    expect(offer!.hotelName).toBe('Concorde De Luxe Resort');
    expect(offer!.hotelStars).toBe(5);
    expect(offer!.boardType).toBe('all-inclusive');
    expect(offer!.priceTotal).toBe(3299);
    expect(offer!.pricePerPerson).toBe(1650);
    expect(offer!.departureDate).toBe('2026-06-01');
    expect(offer!.nights).toBe(7);
    expect(offer!.departureAirport).toBe('KTW');
  });

  it('maps second offer as ultra-all-inclusive', () => {
    const offers = parseEximApiResponse(fixture);
    expect(offers[1]!.boardType).toBe('ultra-all-inclusive');
    expect(offers[1]!.nights).toBe(10);
  });

  it('skips offers with zero price', () => {
    const zeroPrice = { offers: [{ hotelName: 'Test', priceTotal: 0 }] };
    expect(parseEximApiResponse(zeroPrice)).toHaveLength(0);
  });

  it('returns empty for non-object input', () => {
    expect(parseEximApiResponse(null)).toEqual([]);
    expect(parseEximApiResponse('garbage')).toEqual([]);
  });
});

describe('parseEximPrice', () => {
  it('parses "3 299"', () => expect(parseEximPrice('3 299')).toBe(3299));
  it('returns 0 for empty', () => expect(parseEximPrice('')).toBe(0));
});

describe('parseEximStars', () => {
  it('parses "5"', () => expect(parseEximStars('5')).toBe(5));
  it('parses "4 gwiazdki"', () => expect(parseEximStars('4 gwiazdki')).toBe(4));
});

describe('parseEximNights', () => {
  it('parses "7 nocy"', () => expect(parseEximNights('7 nocy')).toBe(7));
  it('falls back to 7', () => expect(parseEximNights('')).toBe(7));
});

describe('parseEximBoardType', () => {
  it.each([
    ['All Inclusive', 'all-inclusive'],
    ['UAI', 'ultra-all-inclusive'],
    ['HB', 'half-board'],
    ['BB', 'bed-and-breakfast'],
  ] as const)('parses "%s"', (raw, expected) => {
    expect(parseEximBoardType(raw)).toBe(expected);
  });
});

describe('parseEximDate', () => {
  it('parses ISO format', () => expect(parseEximDate('2026-06-01')).toBe('2026-06-01'));
  it('parses DD.MM.YYYY', () => expect(parseEximDate('01.06.2026')).toBe('2026-06-01'));
});

describe('parseEximAirport', () => {
  it('extracts IATA code', () => expect(parseEximAirport('KTW')).toBe('KTW'));
  it('maps city name', () => expect(parseEximAirport('Katowice')).toBe('KTW'));
});
