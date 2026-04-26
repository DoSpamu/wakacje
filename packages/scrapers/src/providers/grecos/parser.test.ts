import { describe, it, expect } from 'vitest';
import {
  parseGrecosPrice,
  parseGrecosStars,
  parseGrecosNights,
  parseGrecosBoardType,
  parseGrecosDate,
  parseGrecosAirport,
} from './parser.js';

describe('parseGrecosPrice', () => {
  it('parses "3 299"', () => expect(parseGrecosPrice('3 299')).toBe(3299));
  it('parses "1234,56"', () => expect(parseGrecosPrice('1234,56')).toBeCloseTo(1234.56));
  it('returns 0 for empty', () => expect(parseGrecosPrice('')).toBe(0));
});

describe('parseGrecosStars', () => {
  it('counts "*****" as 5', () => expect(parseGrecosStars('*****')).toBe(5));
  it('counts "****" as 4', () => expect(parseGrecosStars('****')).toBe(4));
  it('counts "***" as 3', () => expect(parseGrecosStars('***')).toBe(3));
  it('rounds up "***+" to 4', () => expect(parseGrecosStars('***+')).toBe(4));
  it('caps at 5 for "*****+"', () => expect(parseGrecosStars('*****+')).toBe(5));
  it('falls back to 4 for empty', () => expect(parseGrecosStars('')).toBe(4));
});

describe('parseGrecosNights', () => {
  it('parses "7 nocy"', () => expect(parseGrecosNights('7 nocy')).toBe(7));
  it('falls back to 7', () => expect(parseGrecosNights('')).toBe(7));
  it('parses plain "14"', () => expect(parseGrecosNights('14')).toBe(14));
});

describe('parseGrecosBoardType', () => {
  it.each([
    ['All Inclusive', 'all-inclusive'],
    ['Ultra All Inclusive', 'ultra-all-inclusive'],
    ['Half Board', 'half-board'],
    ['Full Board', 'full-board'],
    ['Breakfast', 'bed-and-breakfast'],
    ['Room Only', 'room-only'],
    ['mystery', 'unknown'],
  ] as const)('parses "%s" → "%s"', (raw, expected) => {
    expect(parseGrecosBoardType(raw)).toBe(expected);
  });
});

describe('parseGrecosDate', () => {
  it('parses YYYYMMDD compact format', () => expect(parseGrecosDate('20260601')).toBe('2026-06-01'));
  it('parses DD.MM.YYYY', () => expect(parseGrecosDate('01.06.2026')).toBe('2026-06-01'));
  it('passes through ISO date', () => expect(parseGrecosDate('2026-06-01')).toBe('2026-06-01'));
});

describe('parseGrecosAirport', () => {
  it('extracts IATA code', () => expect(parseGrecosAirport('KTW')).toBe('KTW'));
  it('maps "Katowice"', () => expect(parseGrecosAirport('Katowice')).toBe('KTW'));
  it('maps "Kraków"', () => expect(parseGrecosAirport('Kraków')).toBe('KRK'));
  it('defaults to KTW for unknown', () => expect(parseGrecosAirport('Berlin')).toBe('KTW'));
});
