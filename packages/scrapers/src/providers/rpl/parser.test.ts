import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRplNextData,
  parseRplPrice,
  parseRplStars,
  parseRplNights,
  parseRplBoardType,
  parseRplDate,
  parseRplAirport,
} from './parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/next-data.json'), 'utf-8')
);

describe('parseRplNextData', () => {
  it('extracts offers from __NEXT_DATA__ fixture', () => {
    const offers = parseRplNextData(fixture);
    expect(offers).toHaveLength(2);
  });

  it('maps first offer correctly', () => {
    const [offer] = parseRplNextData(fixture);
    expect(offer!.providerCode).toBe('rpl');
    expect(offer!.hotelName).toBe('Crystal Palace Luxury Resort');
    expect(offer!.hotelStars).toBe(5);
    expect(offer!.priceTotal).toBe(6598);
    expect(offer!.nights).toBe(7);
    expect(offer!.boardType).toBe('all-inclusive');
    expect(offer!.departureDate).toBe('2026-06-01');
    expect(offer!.returnDate).toBe('2026-06-08');
  });

  it('maps second offer board type as ultra-all-inclusive', () => {
    const offers = parseRplNextData(fixture);
    expect(offers[1]!.boardType).toBe('ultra-all-inclusive');
  });

  it('returns empty array for empty offers list', () => {
    const result = parseRplNextData({ props: { pageProps: { offers: [] } } });
    expect(result).toEqual([]);
  });

  it('returns empty array for unknown shape', () => {
    expect(parseRplNextData({})).toEqual([]);
    expect(parseRplNextData(null)).toEqual([]);
    expect(parseRplNextData('garbage')).toEqual([]);
  });
});

describe('parseRplPrice', () => {
  it('parses "3 299 PLN"', () => expect(parseRplPrice('3 299 PLN')).toBe(3299));
  it('parses "1234,56"', () => expect(parseRplPrice('1234,56')).toBeCloseTo(1234.56));
  it('returns 0 for empty string', () => expect(parseRplPrice('')).toBe(0));
});

describe('parseRplStars', () => {
  it('parses "4"', () => expect(parseRplStars('4')).toBe(4));
  it('parses "5-star"', () => expect(parseRplStars('5-star')).toBe(5));
  it('falls back to 4 for non-numeric', () => expect(parseRplStars('super')).toBe(4));
});

describe('parseRplNights', () => {
  it('extracts nights from "7 noclegów"', () => expect(parseRplNights('7 noclegów')).toBe(7));
  it('extracts nights from "8 noclegi"', () => expect(parseRplNights('8 noclegi')).toBe(8));
  it('derives nights from days "8 dni"', () => expect(parseRplNights('8 dni')).toBe(7));
  it('falls back to plain number', () => expect(parseRplNights('14')).toBe(14));
});

describe('parseRplBoardType', () => {
  it.each([
    ['All Inclusive', 'all-inclusive'],
    ['Ultra All Inclusive', 'ultra-all-inclusive'],
    ['Half Board', 'half-board'],
    ['Full Board', 'full-board'],
    ['Breakfast', 'bed-and-breakfast'],
    ['Room Only', 'room-only'],
    ['unknown', 'unknown'],
  ] as const)('parses "%s" → "%s"', (raw, expected) => {
    expect(parseRplBoardType(raw)).toBe(expected);
  });
});

describe('parseRplDate', () => {
  it('parses DD.MM.YYYY', () => expect(parseRplDate('09.06.2026')).toBe('2026-06-09'));
  it('passes through ISO date', () => expect(parseRplDate('2026-06-09')).toBe('2026-06-09'));
  it('parses Polish month name', () => expect(parseRplDate('9 cze 2026')).toBe('2026-06-09'));
});

describe('parseRplAirport', () => {
  it('extracts IATA code "KTW"', () => expect(parseRplAirport('KTW')).toBe('KTW'));
  it('maps "Katowice" → KTW', () => expect(parseRplAirport('Katowice')).toBe('KTW'));
  it('maps "Kraków" → KRK', () => expect(parseRplAirport('Kraków')).toBe('KRK'));
  it('maps "Warszawa" → WAW', () => expect(parseRplAirport('Warszawa')).toBe('WAW'));
});
