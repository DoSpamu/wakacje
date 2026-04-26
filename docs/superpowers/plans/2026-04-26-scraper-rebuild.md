# Scraper Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild packages/scrapers to be testable, resilient, and free of Coral Travel + Fuse.js tech debt.

**Architecture:** Infrastructure-first — pure parser functions → Vitest fixture tests → orchestrator retry/sanity → pg_trgm hotel matching. Each task produces a green `pnpm test` before moving to the next.

**Tech Stack:** TypeScript, Vitest 2.x, Supabase (PostgreSQL + pg_trgm RPC), patchright (Playwright fork)

**Spec:** `docs/superpowers/specs/2026-04-26-scraper-rebuild-design.md`

---

## File Map

| Task | Files Created | Files Modified |
|------|--------------|----------------|
| 1 | — | `.gitignore`, `orchestrator.ts`, `shared/types/offer.ts`, `scrapers/package.json` — DELETE `providers/coral/` |
| 2 | — | `providers/rpl/parser.ts`, `providers/rpl/RplScraper.ts` |
| 3 | — | `providers/tui/parser.ts`, `providers/tui/TuiScraper.ts` |
| 4 | `vitest.config.ts` | `packages/scrapers/package.json` |
| 5 | `providers/*/fixtures/*.json` | — |
| 6 | `providers/rpl/parser.test.ts` | — |
| 7 | `providers/itaka/parser.test.ts`, `providers/exim/parser.test.ts` | — |
| 8 | `providers/tui/parser.test.ts` | — |
| 9 | `providers/grecos/parser.test.ts` | — |
| 10 | — | `orchestrator.ts` |
| 11 | `supabase/migrations/007_find_similar_hotels.sql` | — |
| 12 | — | `db/queries.ts` |
| 13 | — | `normalizer/HotelNormalizer.ts`, `orchestrator.ts`, `scrapers/package.json` |

---

## Task 1: Remove Coral + gitignore spy files

**Files:**
- Delete: `packages/scrapers/src/providers/coral/` (directory)
- Modify: `.gitignore`
- Modify: `packages/scrapers/src/orchestrator.ts`
- Modify: `packages/shared/src/types/offer.ts` (line 48)
- Modify: `packages/scrapers/package.json`

- [ ] **Step 1: Delete the coral directory**

```bash
rm -rf packages/scrapers/src/providers/coral
```

- [ ] **Step 2: Add spy files to .gitignore**

Add these lines at the end of `.gitignore`:

```gitignore
# Scraper spy/debug tools (local only)
packages/scrapers/src/spy-*.ts
packages/scrapers/spy-*.json
```

- [ ] **Step 3: Remove Coral from orchestrator.ts**

In `packages/scrapers/src/orchestrator.ts`:

Remove line:
```typescript
import { CoralScraper } from './providers/coral/CoralScraper.js';
```

Change `PROVIDER_SCRAPERS` from:
```typescript
const PROVIDER_SCRAPERS = {
  rpl: RplScraper,
  exim: EximScraper,
  coral: CoralScraper,
  itaka: ItakaScraper,
  grecos: GrecosScraper,
  tui: TuiScraper,
} as const;
```

To:
```typescript
const PROVIDER_SCRAPERS = {
  rpl: RplScraper,
  exim: EximScraper,
  itaka: ItakaScraper,
  grecos: GrecosScraper,
  tui: TuiScraper,
} as const;
```

- [ ] **Step 4: Remove 'coral' from ProviderCode**

In `packages/shared/src/types/offer.ts`, line 48, change:
```typescript
export type ProviderCode = 'rpl' | 'exim' | 'coral' | 'itaka' | 'grecos' | 'tui';
```
To:
```typescript
export type ProviderCode = 'rpl' | 'exim' | 'itaka' | 'grecos' | 'tui';
```

- [ ] **Step 5: Remove scrape:coral from scrapers package.json**

In `packages/scrapers/package.json`, remove the line:
```json
"scrape:coral": "node --env-file=../../.env --import=tsx/esm src/run.ts coral",
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd packages/scrapers && pnpm type-check
cd packages/shared && pnpm type-check
```

Expected: no errors. If coral references remain, find and remove them:
```bash
grep -r "coral" packages/scrapers/src packages/shared/src
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove Coral Travel provider (Incapsula blocked)"
```

---

## Task 2: RPL — export parseRplNextData as pure function

**Files:**
- Modify: `packages/scrapers/src/providers/rpl/parser.ts`
- Modify: `packages/scrapers/src/providers/rpl/RplScraper.ts`

The current `extractFromNextData(data)` in `rpl/parser.ts` is private and pure — processes `__NEXT_DATA__` JSON into `RawOffer[]` without any Playwright dependency. We export it and move `page.evaluate()` into the scraper.

- [ ] **Step 1: Export parseRplNextData from parser.ts**

In `packages/scrapers/src/providers/rpl/parser.ts`, rename the private `extractFromNextData` to `parseRplNextData` and export it:

```typescript
/**
 * Parse offers from Rpl's __NEXT_DATA__ JSON blob.
 * Pure function — no Playwright dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRplNextData(data: unknown): RawOffer[] {
  const offers: RawOffer[] = [];
  if (!data || typeof data !== 'object') return offers;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (data as any)?.props?.pageProps;
    const offerList = props?.offers ?? props?.results ?? props?.data?.offers ?? [];
    if (!Array.isArray(offerList)) return offers;

    for (const raw of offerList) {
      try {
        const offer: RawOffer = {
          providerCode: 'rpl',
          providerOfferId: String(raw.id ?? raw.offerId ?? ''),
          hotelName: String(raw.hotelName ?? raw.hotel?.name ?? ''),
          hotelStars: Number(raw.stars ?? raw.hotel?.stars ?? 4) as RawOffer['hotelStars'],
          hotelLocation: String(raw.location ?? raw.destination ?? ''),
          destinationRaw: String(raw.destination ?? raw.country ?? ''),
          departureAirport: String(raw.departureAirport ?? raw.airport ?? 'KTW'),
          departureDate: String(raw.departureDate ?? raw.departure ?? ''),
          returnDate: String(raw.returnDate ?? raw.return ?? ''),
          nights: Number(raw.nights ?? raw.duration ?? 7),
          boardType: parseRplBoardType(String(raw.board ?? raw.boardType ?? '')),
          priceTotal: Number(raw.priceTotal ?? raw.price?.total ?? 0),
          pricePerPerson: Number(raw.pricePerPerson ?? raw.price?.perPerson ?? 0),
          currency: String(raw.currency ?? 'PLN'),
          adults: Number(raw.adults ?? 2),
          children: Number(raw.children ?? 0),
          sourceUrl: String(raw.url ?? raw.offerUrl ?? ''),
        };
        if (offer.hotelName && offer.priceTotal > 0) offers.push(offer);
      } catch { /* skip malformed */ }
    }
  } catch { /* not parseable */ }

  return offers;
}
```

Also update `parseRplPage` to call `parseRplNextData` instead of the old private function, and remove the old private `extractFromNextData`.

- [ ] **Step 2: Move page.evaluate() into RplScraper.parsePage**

In `packages/scrapers/src/providers/rpl/RplScraper.ts`, update the import:
```typescript
import { parseRplPage, parseRplNextData } from './parser.js';
```

Update `parsePage`:
```typescript
protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
  // Try __NEXT_DATA__ first (pure, fast)
  const nextDataText: string | null = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el?.textContent ?? null;
  });

  if (nextDataText) {
    try {
      const offers = parseRplNextData(JSON.parse(nextDataText));
      if (offers.length > 0) return offers;
    } catch { /* fall through to DOM */ }
  }

  // DOM fallback
  return parseRplPage(page, url);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/scrapers && pnpm type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/scrapers/src/providers/rpl/
git commit -m "refactor(rpl): export parseRplNextData as pure function"
```

---

## Task 3: TUI — extract pure parsing functions

**Files:**
- Modify: `packages/scrapers/src/providers/tui/parser.ts`

The TUI parser has `parseTuiJsonLd(page)` and `parseTuiWindowState(page)` that call `page.evaluate()`. Extract the data-processing logic into pure exported functions.

- [ ] **Step 1: Export parseTuiOfferCode**

In `packages/scrapers/src/providers/tui/parser.ts`, the function `parseTuiOfferCode` is private. Change:
```typescript
function parseTuiOfferCode(
```
To:
```typescript
export function parseTuiOfferCode(
```

- [ ] **Step 2: Add pure parseTuiJsonLdItems**

Add this exported function to `tui/parser.ts` (the data-processing part of `parseTuiJsonLd`, without `page.evaluate()`):

```typescript
/**
 * Parse TUI offers from already-parsed JSON-LD data array.
 * Pure function — input comes from page.evaluate() called by the scraper.
 */
export function parseTuiJsonLdItems(jsonLdData: unknown[]): RawOffer[] {
  const offers: RawOffer[] = [];

  for (const ld of jsonLdData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = ld as any;
    const itemList = schema?.['@type'] === 'ItemList'
      ? schema.itemListElement
      : schema?.itemListElement ?? [];

    if (!Array.isArray(itemList)) continue;

    for (const item of itemList) {
      try {
        const url = String(item?.url ?? '');
        const name = String(item?.name ?? '');
        if (!name || !url) continue;

        const pathMatch = url.match(/\/wypoczynek\/([^/]+)\/([^/]+)\/([^/]+)\//);
        const country = pathMatch?.[1] ?? '';
        const region = pathMatch?.[2] ?? '';

        const codeInfo = parseTuiOfferCode(url);
        if (!codeInfo) continue;

        const codeMatch = url.match(/\/OfferCodeWS\/([A-Z0-9]+)/);
        const code = codeMatch?.[1] ?? '';
        let boardType: RawOffer['boardType'] = 'all-inclusive';
        if (code.includes('UA0') || code.includes('XX')) boardType = 'ultra-all-inclusive';
        else if (code.includes('HB')) boardType = 'half-board';
        else if (code.includes('FB')) boardType = 'full-board';
        else if (code.includes('BB')) boardType = 'bed-and-breakfast';
        else if (code.includes('RO') && !code.includes('ROUAPX')) boardType = 'room-only';

        offers.push({
          providerCode: 'tui',
          hotelName: name,
          hotelStars: 4,
          hotelLocation: region.replace(/-/g, ' '),
          destinationRaw: country,
          departureAirport: codeInfo.depAirport,
          departureDate: codeInfo.depDate,
          returnDate: codeInfo.retDate,
          nights: codeInfo.nights,
          boardType,
          priceTotal: 0,
          pricePerPerson: 0,
          currency: 'PLN',
          adults: 2,
          children: 0,
          sourceUrl: url,
        });
      } catch { /* skip malformed */ }
    }
  }

  return offers;
}
```

- [ ] **Step 3: Add pure parseTuiWindowStateData**

```typescript
/**
 * Parse TUI offers from window state data.
 * Pure function — input is already extracted from window via page.evaluate().
 */
export function parseTuiWindowStateData(windowData: unknown): RawOffer[] {
  if (!windowData) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = windowData as any;
  const offerList = data?.offers ?? data?.results ?? data?.searchResults?.offers ?? [];
  if (!Array.isArray(offerList)) return [];

  return (offerList as unknown[]).map((raw) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any;
    const depDate = parseTuiDate(String(r.departureDate ?? r.date ?? ''));
    const nights = Number(r.nights ?? r.duration ?? 7);
    const returnDateObj = new Date(depDate);
    returnDateObj.setDate(returnDateObj.getDate() + nights);

    return {
      providerCode: 'tui' as const,
      providerOfferId: String(r.id ?? r.offerId ?? ''),
      hotelName: String(r.hotelName ?? r.hotel?.name ?? ''),
      hotelStars: Math.min(5, Number(r.stars ?? r.hotelCategory ?? 4)) as RawOffer['hotelStars'],
      hotelLocation: String(r.location ?? r.resort ?? r.destination ?? ''),
      destinationRaw: String(r.country ?? r.countryName ?? ''),
      departureAirport: parseTuiAirport(String(r.departureAirport ?? r.from ?? '')),
      departureDate: depDate,
      returnDate: returnDateObj.toISOString().split('T')[0]!,
      nights,
      boardType: parseTuiBoardType(String(r.boardType ?? r.board ?? r.boardCode ?? '')),
      priceTotal: Number(r.price ?? r.totalPrice ?? r.priceTotal ?? 0),
      pricePerPerson: Number(r.pricePerPerson ?? r.perPersonPrice ?? 0),
      currency: 'PLN',
      adults: Number(r.adults ?? 2),
      children: Number(r.children ?? 0),
      sourceUrl: String(r.url ?? r.offerUrl ?? 'https://www.tui.pl'),
      rawData: r as Record<string, unknown>,
    } satisfies RawOffer;
  }).filter((o) => o.hotelName && o.priceTotal > 0);
}
```

- [ ] **Step 4: Wire pure functions into private parseTuiJsonLd and parseTuiWindowState**

In the private `parseTuiJsonLd(page)`, after `await page.evaluate(...)` returns `jsonLdData`:
```typescript
return parseTuiJsonLdItems(jsonLdData as unknown[]);
```

In the private `parseTuiWindowState(page)`, replace the inline `offerList.map(...)` with:
```typescript
return parseTuiWindowStateData(windowData);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd packages/scrapers && pnpm type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/scrapers/src/providers/tui/
git commit -m "refactor(tui): export parseTuiJsonLdItems, parseTuiWindowStateData, parseTuiOfferCode"
```

---

## Task 4: Install Vitest

**Files:**
- Create: `packages/scrapers/vitest.config.ts`
- Modify: `packages/scrapers/package.json`

- [ ] **Step 1: Add Vitest to devDependencies**

```bash
cd packages/scrapers && pnpm add -D vitest@^2.0.0 @vitest/coverage-v8@^2.0.0
```

- [ ] **Step 2: Create vitest.config.ts**

Create `packages/scrapers/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 3: Add test scripts to scrapers package.json**

In `packages/scrapers/package.json`, inside `"scripts"` add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs**

Create throwaway test `packages/scrapers/src/sanity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
describe('sanity', () => {
  it('works', () => expect(1 + 1).toBe(2))
})
```

Run:
```bash
cd packages/scrapers && pnpm test
```

Expected:
```
✓ src/sanity.test.ts (1)
Test Files  1 passed (1)
```

- [ ] **Step 5: Delete sanity test and commit**

```bash
rm packages/scrapers/src/sanity.test.ts
git add packages/scrapers/package.json packages/scrapers/vitest.config.ts
git commit -m "chore: add Vitest to packages/scrapers"
```

---

## Task 5: Collect fixtures

**Files:**
- Create: `packages/scrapers/src/providers/tui/fixtures/api-response.json`
- Create: `packages/scrapers/src/providers/itaka/fixtures/api-response.json`
- Create: `packages/scrapers/src/providers/exim/fixtures/api-response.json`
- Create: `packages/scrapers/src/providers/rpl/fixtures/next-data.json`

- [ ] **Step 1: Create fixture directories**

```bash
mkdir -p packages/scrapers/src/providers/tui/fixtures
mkdir -p packages/scrapers/src/providers/itaka/fixtures
mkdir -p packages/scrapers/src/providers/exim/fixtures
mkdir -p packages/scrapers/src/providers/rpl/fixtures
mkdir -p packages/scrapers/src/providers/grecos/fixtures
```

- [ ] **Step 2: TUI fixture — from spy-tui.json**

`packages/scrapers/spy-tui.json` already exists. Open it, find the entry whose response body contains `"@type": "ItemList"` with `itemListElement` array containing TUI offer URLs (they contain `/OfferCodeWS/`).

Create `packages/scrapers/src/providers/tui/fixtures/api-response.json` as a JSON array of parsed JSON-LD script tags:
```json
[
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": [
      {
        "url": "https://www.tui.pl/wypoczynek/turcja/riwiera-turecka/rixos-premium-tekirova/KTWJGA20260606/OfferCodeWS/KTWJGA20260606055020260613080007VRN85058APX1AI02",
        "name": "Rixos Premium Tekirova"
      }
    ]
  }
]
```

Replace the example above with actual data from spy-tui.json. The fixture needs at least 1 offer with a valid OfferCodeWS URL (format: 3-letter airport + dates in `YYYYMMDD` + `L` + 2-digit nights).

- [ ] **Step 3: Itaka fixture — run spy-deep.ts**

```bash
cd packages/scrapers
node --import=tsx/esm src/spy-deep.ts itaka
```

This creates `packages/scrapers/spy-itaka.json`. Find the captured response that contains `main.rates.list` with rate objects. The structure looks like:

```json
{
  "pageProps": {
    "initialQueryState": {
      "queries": [
        {
          "state": {
            "data": {
              "main": {
                "rates": {
                  "list": [
                    {
                      "id": "abc123",
                      "price": 579800,
                      "currency": "PLN",
                      "segments": [
                        { "type": "flight", "beginDateTime": "2026-06-10T06:00:00+02:00", "departure": { "title": "Katowice (KTW)" }, "destination": { "title": "Rodos" } },
                        { "type": "hotel", "content": { "title": "Rixos Premium Tekirova", "hotelRating": 50 }, "meal": { "id": "A" }, "beginDate": "2026-06-10", "endDate": "2026-06-17" }
                      ],
                      "participants": [{ "type": "adult", "price": 289900 }, { "type": "adult", "price": 289900 }]
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    }
  }
}
```

Copy this structure (with real data from spy-itaka.json) to `packages/scrapers/src/providers/itaka/fixtures/api-response.json`.

- [ ] **Step 4: Exim fixture — run spy-deep.ts**

```bash
node --import=tsx/esm src/spy-deep.ts exim
```

Creates `packages/scrapers/spy-exim.json`. Find response with an `offers` array. Copy to `packages/scrapers/src/providers/exim/fixtures/api-response.json`.

If the Exim API response has a different shape, check what structure `parseEximApiResponse` handles: it looks for `data.offers` or `data.data.offers` or `data.results`.

- [ ] **Step 5: RPL fixture — hand-crafted stub**

Create `packages/scrapers/src/providers/rpl/fixtures/next-data.json`:
```json
{
  "props": {
    "pageProps": {
      "offers": [
        {
          "id": "rpl-test-001",
          "hotelName": "Rixos Premium Tekirova",
          "stars": 5,
          "location": "Turcja, Antalya",
          "destination": "Turcja",
          "departureAirport": "KTW",
          "departureDate": "2026-06-10",
          "returnDate": "2026-06-17",
          "nights": 7,
          "board": "All Inclusive",
          "priceTotal": 9800,
          "pricePerPerson": 4900,
          "currency": "PLN",
          "adults": 2,
          "children": 0,
          "url": "https://r.pl/oferta/rixos-test"
        }
      ]
    }
  }
}
```

- [ ] **Step 6: Commit fixtures**

```bash
git add packages/scrapers/src/providers/*/fixtures/
git commit -m "test: add parser fixtures for all 5 providers"
```

---

## Task 6: Tests — RPL parser

**Files:**
- Create: `packages/scrapers/src/providers/rpl/parser.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/scrapers/src/providers/rpl/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseRplPrice,
  parseRplStars,
  parseRplNights,
  parseRplBoardType,
  parseRplDate,
  parseRplAirport,
  parseRplNextData,
} from './parser.js'

const nextData = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/next-data.json'), 'utf-8')
)

describe('parseRplPrice', () => {
  it('parses "3 299 PLN" → 3299', () => expect(parseRplPrice('3 299 PLN')).toBe(3299))
  it('parses "4 500" → 4500', () => expect(parseRplPrice('4 500')).toBe(4500))
  it('returns 0 for empty string', () => expect(parseRplPrice('')).toBe(0))
})

describe('parseRplStars', () => {
  it('parses "4" → 4', () => expect(parseRplStars('4')).toBe(4))
  it('parses "5-star" → 5', () => expect(parseRplStars('5-star')).toBe(5))
  it('defaults to 4 for unknown', () => expect(parseRplStars('???')).toBe(4))
})

describe('parseRplNights', () => {
  it('parses "04.09.2026 (8 dni / 7 noclegów)" → 7', () =>
    expect(parseRplNights('04.09.2026 (8 dni / 7 noclegów)')).toBe(7))
  it('parses "14 noclegów" → 14', () => expect(parseRplNights('14 noclegów')).toBe(14))
  it('parses "8 dni" → 7 (days minus 1)', () => expect(parseRplNights('8 dni')).toBe(7))
})

describe('parseRplBoardType', () => {
  it('detects all-inclusive', () => expect(parseRplBoardType('All Inclusive')).toBe('all-inclusive'))
  it('detects ultra-all-inclusive', () => expect(parseRplBoardType('Ultra All Inclusive')).toBe('ultra-all-inclusive'))
  it('detects half-board', () => expect(parseRplBoardType('Half Board')).toBe('half-board'))
  it('returns unknown for gibberish', () => expect(parseRplBoardType('xyz')).toBe('unknown'))
})

describe('parseRplDate', () => {
  it('parses DD.MM.YYYY → YYYY-MM-DD', () => expect(parseRplDate('09.06.2026')).toBe('2026-06-09'))
  it('passes through ISO date', () => expect(parseRplDate('2026-06-09')).toBe('2026-06-09'))
})

describe('parseRplAirport', () => {
  it('returns IATA code as-is', () => expect(parseRplAirport('KTW')).toBe('KTW'))
  it('maps Katowice → KTW', () => expect(parseRplAirport('Katowice')).toBe('KTW'))
  it('maps Kraków → KRK', () => expect(parseRplAirport('Kraków')).toBe('KRK'))
})

describe('parseRplNextData', () => {
  it('returns empty array for null input', () => expect(parseRplNextData(null)).toEqual([]))
  it('parses offers from fixture', () => {
    const offers = parseRplNextData(nextData)
    expect(offers.length).toBeGreaterThan(0)
  })
  it('offer has required fields', () => {
    const offers = parseRplNextData(nextData)
    const offer = offers[0]!
    expect(offer.hotelName).toBeTruthy()
    expect(offer.priceTotal).toBeGreaterThan(0)
    expect(offer.boardType).toBe('all-inclusive')
    expect(offer.providerCode).toBe('rpl')
  })
  it('prices are in valid PLN range', () => {
    const offers = parseRplNextData(nextData)
    for (const o of offers) {
      expect(o.pricePerPerson).toBeGreaterThanOrEqual(500)
      expect(o.pricePerPerson).toBeLessThanOrEqual(50000)
    }
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/scrapers && pnpm test
```

Expected: all RPL tests pass. If `parseRplNextData` is not exported, add `export` in `parser.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/scrapers/src/providers/rpl/parser.test.ts
git commit -m "test(rpl): add fixture-based parser tests"
```

---

## Task 7: Tests — Itaka + Exim parsers

**Files:**
- Create: `packages/scrapers/src/providers/itaka/parser.test.ts`
- Create: `packages/scrapers/src/providers/exim/parser.test.ts`

- [ ] **Step 1: Write Itaka tests**

Create `packages/scrapers/src/providers/itaka/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseItakaPrice,
  parseItakaBoardType,
  parseItakaDate,
  parseItakaAirport,
  parseItakaApiResponse,
} from './parser.js'

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/api-response.json'), 'utf-8')
)

describe('parseItakaPrice', () => {
  it('parses "5 798" → 5798', () => expect(parseItakaPrice('5 798')).toBe(5798))
  it('returns 0 for empty', () => expect(parseItakaPrice('')).toBe(0))
})

describe('parseItakaBoardType', () => {
  it('detects all-inclusive from "ai"', () => expect(parseItakaBoardType('ai')).toBe('all-inclusive'))
  it('detects ultra-all-inclusive from "uai"', () => expect(parseItakaBoardType('uai')).toBe('ultra-all-inclusive'))
  it('detects half-board from "hb"', () => expect(parseItakaBoardType('hb')).toBe('half-board'))
})

describe('parseItakaDate', () => {
  it('parses "9.04.2026" → "2026-04-09"', () => expect(parseItakaDate('9.04.2026')).toBe('2026-04-09'))
  it('parses "09.04.2026" → "2026-04-09"', () => expect(parseItakaDate('09.04.2026')).toBe('2026-04-09'))
})

describe('parseItakaAirport', () => {
  it('extracts "Katowice (KTW)" → KTW', () => expect(parseItakaAirport('Katowice (KTW)')).toBe('KTW'))
  it('maps Katowice → KTW', () => expect(parseItakaAirport('Katowice')).toBe('KTW'))
})

describe('parseItakaApiResponse with fixture', () => {
  it('returns empty array for null', () => expect(parseItakaApiResponse(null)).toEqual([]))
  it('parses offers from fixture', () => {
    const offers = parseItakaApiResponse(fixture)
    expect(offers.length).toBeGreaterThan(0)
  })
  it('offer has required fields', () => {
    const offers = parseItakaApiResponse(fixture)
    const offer = offers[0]!
    expect(offer.hotelName).toBeTruthy()
    expect(offer.priceTotal).toBeGreaterThan(0)
    expect(offer.providerCode).toBe('itaka')
  })
  it('prices are in valid range (Itaka prices in grosze ÷ 100)', () => {
    const offers = parseItakaApiResponse(fixture)
    for (const o of offers) {
      expect(o.priceTotal).toBeGreaterThanOrEqual(500)
      expect(o.priceTotal).toBeLessThanOrEqual(100000)
    }
  })
})
```

- [ ] **Step 2: Write Exim tests**

Create `packages/scrapers/src/providers/exim/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseEximPrice,
  parseEximBoardType,
  parseEximDate,
  parseEximAirport,
  parseEximApiResponse,
} from './parser.js'

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/api-response.json'), 'utf-8')
)

describe('parseEximPrice', () => {
  it('parses "4 200" → 4200', () => expect(parseEximPrice('4 200')).toBe(4200))
  it('returns 0 for empty', () => expect(parseEximPrice('')).toBe(0))
})

describe('parseEximBoardType', () => {
  it('detects all-inclusive', () => expect(parseEximBoardType('All Inclusive')).toBe('all-inclusive'))
  it('detects ultra from "Ultra All Inclusive"', () => expect(parseEximBoardType('Ultra All Inclusive')).toBe('ultra-all-inclusive'))
  it('detects half-board from "HB"', () => expect(parseEximBoardType('HB')).toBe('half-board'))
})

describe('parseEximDate', () => {
  it('parses DD.MM.YYYY', () => expect(parseEximDate('15.07.2026')).toBe('2026-07-15'))
  it('passes ISO format', () => expect(parseEximDate('2026-07-15')).toBe('2026-07-15'))
})

describe('parseEximAirport', () => {
  it('extracts code from "(KTW)"', () => expect(parseEximAirport('Katowice (KTW)')).toBe('KTW'))
  it('maps Katowice → KTW', () => expect(parseEximAirport('Katowice')).toBe('KTW'))
})

describe('parseEximApiResponse with fixture', () => {
  it('returns empty array for null', () => expect(parseEximApiResponse(null)).toEqual([]))
  it('parses offers from fixture', () => {
    const offers = parseEximApiResponse(fixture)
    expect(offers.length).toBeGreaterThan(0)
  })
  it('offer has required fields', () => {
    const offers = parseEximApiResponse(fixture)
    const o = offers[0]!
    expect(o.hotelName).toBeTruthy()
    expect(o.priceTotal).toBeGreaterThan(0)
    expect(o.providerCode).toBe('exim')
  })
})
```

- [ ] **Step 3: Run all tests**

```bash
cd packages/scrapers && pnpm test
```

Expected: RPL + Itaka + Exim all pass. If fixture is empty (spy didn't capture offers) → go back to Task 5 and re-collect.

- [ ] **Step 4: Commit**

```bash
git add packages/scrapers/src/providers/itaka/parser.test.ts packages/scrapers/src/providers/exim/parser.test.ts
git commit -m "test(itaka, exim): add fixture-based parser tests"
```

---

## Task 8: Tests — TUI parser

**Files:**
- Create: `packages/scrapers/src/providers/tui/parser.test.ts`

- [ ] **Step 1: Write TUI tests**

Create `packages/scrapers/src/providers/tui/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseTuiPrice,
  parseTuiDate,
  parseTuiBoardType,
  parseTuiOfferCode,
  parseTuiJsonLdItems,
} from './parser.js'

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/api-response.json'), 'utf-8')
) as unknown[]

describe('parseTuiPrice', () => {
  it('parses "5 998" → 5998', () => expect(parseTuiPrice('5 998')).toBe(5998))
  it('returns 0 for empty', () => expect(parseTuiPrice('')).toBe(0))
})

describe('parseTuiDate', () => {
  it('parses DD.MM.YYYY → YYYY-MM-DD', () => expect(parseTuiDate('15.07.2026')).toBe('2026-07-15'))
})

describe('parseTuiBoardType', () => {
  it('detects all-inclusive', () => expect(parseTuiBoardType('all inclusive')).toBe('all-inclusive'))
  it('detects ultra from code "GT06-XX"', () => expect(parseTuiBoardType('GT06-XX')).toBe('ultra-all-inclusive'))
  it('detects half-board from "GT06-HB"', () => expect(parseTuiBoardType('GT06-HB')).toBe('half-board'))
})

describe('parseTuiOfferCode', () => {
  it('parses KTW airport from offer URL', () => {
    const code = 'KTWJGA20260506055020260506202605130800L07VRN85058APX1AI02'
    const url = `https://www.tui.pl/wypoczynek/turcja/antalya/hotel/KTWJGA20260506/OfferCodeWS/${code}`
    const result = parseTuiOfferCode(url)
    expect(result).not.toBeNull()
    expect(result!.depAirport).toBe('KTW')
    expect(result!.depDate).toBe('2026-05-06')
    expect(result!.nights).toBe(7)
  })
  it('returns null for URL without OfferCodeWS', () => {
    expect(parseTuiOfferCode('https://www.tui.pl/wyniki')).toBeNull()
  })
})

describe('parseTuiJsonLdItems with fixture', () => {
  it('parses offers from fixture', () => {
    const offers = parseTuiJsonLdItems(fixture)
    expect(offers.length).toBeGreaterThan(0)
  })
  it('each offer has hotelName and departure date', () => {
    const offers = parseTuiJsonLdItems(fixture)
    const o = offers[0]!
    expect(o.hotelName).toBeTruthy()
    expect(o.departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(o.nights).toBeGreaterThan(0)
    expect(o.providerCode).toBe('tui')
  })
})
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/scrapers && pnpm test
```

Expected: all previous + TUI tests pass. If `parseTuiOfferCode` not exported → fix in parser.ts.

- [ ] **Step 3: Commit**

```bash
git add packages/scrapers/src/providers/tui/parser.test.ts
git commit -m "test(tui): add fixture-based parser tests"
```

---

## Task 9: Tests — Grecos parser

**Files:**
- Create: `packages/scrapers/src/providers/grecos/parser.test.ts`

Grecos has no JSON API path (DOM only). Test pure helper functions.

- [ ] **Step 1: Write tests**

Create `packages/scrapers/src/providers/grecos/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  parseGrecosPrice,
  parseGrecosStars,
  parseGrecosNights,
  parseGrecosBoardType,
} from './parser.js'

describe('parseGrecosPrice', () => {
  it('parses "3 499 PLN" → 3499', () => expect(parseGrecosPrice('3 499 PLN')).toBe(3499))
  it('returns 0 for empty', () => expect(parseGrecosPrice('')).toBe(0))
})

describe('parseGrecosStars', () => {
  it('parses "****" → 4', () => expect(parseGrecosStars('****')).toBe(4))
  it('parses "***+" → 4 (rounds up half-star)', () => expect(parseGrecosStars('***+')).toBe(4))
  it('parses "*****" → 5', () => expect(parseGrecosStars('*****')).toBe(5))
  it('defaults to 4 for empty', () => expect(parseGrecosStars('')).toBe(4))
})

describe('parseGrecosNights', () => {
  it('extracts number from "7 nocy" → 7', () => expect(parseGrecosNights('7 nocy')).toBe(7))
  it('extracts from plain "14" → 14', () => expect(parseGrecosNights('14')).toBe(14))
  it('defaults to 7 for empty', () => expect(parseGrecosNights('')).toBe(7))
})

describe('parseGrecosBoardType', () => {
  it('detects all inclusive', () => expect(parseGrecosBoardType('All Inclusive')).toBe('all-inclusive'))
  it('detects ultra from "UAI"', () => expect(parseGrecosBoardType('UAI')).toBe('ultra-all-inclusive'))
  it('detects half-board from "HB"', () => expect(parseGrecosBoardType('HB')).toBe('half-board'))
  it('returns unknown for empty', () => expect(parseGrecosBoardType('')).toBe('unknown'))
})
```

- [ ] **Step 2: Run all 5 test files**

```bash
cd packages/scrapers && pnpm test
```

Expected:
```
✓ src/providers/rpl/parser.test.ts
✓ src/providers/itaka/parser.test.ts
✓ src/providers/exim/parser.test.ts
✓ src/providers/tui/parser.test.ts
✓ src/providers/grecos/parser.test.ts
Test Files  5 passed (5)
Tests       ≥15 passed
```

- [ ] **Step 3: Commit**

```bash
git add packages/scrapers/src/providers/grecos/parser.test.ts
git commit -m "test(grecos): add pure helper parser tests — all 5 providers covered"
```

---

## Task 10: Orchestrator — retry + sanity check

**Files:**
- Modify: `packages/scrapers/src/orchestrator.ts`

- [ ] **Step 1: Add sleep helper**

In `packages/scrapers/src/orchestrator.ts`, after the imports section add:

```typescript
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
```

- [ ] **Step 2: Add scrapeWithRetry**

Add before `runScrape`:

```typescript
async function scrapeWithRetry(
  scraper: { scrape(ctx: ScrapeContext): Promise<{ offers: unknown[]; errors: Array<{ message: string }> }> },
  ctx: ScrapeContext,
  providerCode: string,
  maxAttempts = 2,
): Promise<{ offers: unknown[]; errors: Array<{ message: string }> }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scraper.scrape(ctx);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        logger.warn(`[${providerCode}] attempt ${attempt} failed, retrying in ${attempt * 5}s`, {
          error: String(err),
        });
        await sleep(attempt * 5000);
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 3: Add validateProviderResult**

Add after `scrapeWithRetry`:

```typescript
function validateProviderResult(providerCode: string, offerCount: number): void {
  if (offerCount < 5) {
    logger.warn(`[${providerCode}] sanity FAIL: ${offerCount} offers (expected ≥5)`);
  } else {
    logger.info(`[${providerCode}] sanity OK: ${offerCount} offers`);
  }
}
```

- [ ] **Step 4: Wire retry into the scrape loop**

In `runScrape`, inside the `limit(async () => {...})` callback, find:
```typescript
const ScraperClass = PROVIDER_SCRAPERS[providerCode];
const scraper = new ScraperClass();

const result = await scraper.scrape(ctx);
```

Replace with:
```typescript
const ScraperClass = PROVIDER_SCRAPERS[providerCode];
const scraper = new ScraperClass();

const result = await scrapeWithRetry(scraper, ctx, providerCode);
```

After `totalOffersScraped += result.offers.length;` add:
```typescript
validateProviderResult(providerCode, result.offers.length);
```

- [ ] **Step 5: Verify TypeScript and tests**

```bash
cd packages/scrapers && pnpm type-check && pnpm test
```

Expected: no type errors, all 5 test files pass.

- [ ] **Step 6: Commit**

```bash
git add packages/scrapers/src/orchestrator.ts
git commit -m "feat(orchestrator): add per-provider retry (2 attempts) + sanity check logging"
```

---

## Task 11: Hotel matching — SQL migration

**Files:**
- Create: `supabase/migrations/007_find_similar_hotels.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/007_find_similar_hotels.sql`:

```sql
-- Migration 007: pg_trgm function for hotel name similarity matching
-- Replaces Fuse.js fuzzy matching with PostgreSQL trigram similarity
-- Requires: pg_trgm extension (already enabled in migration 001)

CREATE OR REPLACE FUNCTION find_similar_hotels(
  p_normalized_name text,
  p_destination_id uuid,
  p_min_similarity float8 DEFAULT 0.45
)
RETURNS TABLE(
  id uuid,
  canonical_name text,
  normalized_name text,
  destination_id uuid,
  stars smallint,
  sim float8
)
LANGUAGE sql STABLE AS $$
  SELECT
    h.id,
    h.canonical_name,
    h.normalized_name,
    h.destination_id,
    h.stars,
    similarity(h.normalized_name, p_normalized_name) AS sim
  FROM hotels h
  WHERE h.destination_id = p_destination_id
    AND similarity(h.normalized_name, p_normalized_name) > p_min_similarity
  ORDER BY sim DESC
  LIMIT 3;
$$;

GRANT EXECUTE ON FUNCTION find_similar_hotels(text, uuid, float8) TO anon, service_role;
```

- [ ] **Step 2: Apply to Supabase**

```bash
cd packages/scrapers && pnpm migrate
```

If that fails, paste the SQL into Supabase dashboard → SQL Editor and run it.

Verify the function exists:
```bash
cd packages/scrapers
node --env-file=../../.env --import=tsx/esm -e "
  import { createClient } from '@supabase/supabase-js'
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await sb.rpc('find_similar_hotels', {
    p_normalized_name: 'rixos',
    p_destination_id: '00000000-0000-0000-0000-000000000000'
  })
  console.log(error ? 'ERROR: ' + error.message : 'OK: function exists, rows=' + (data?.length ?? 0))
"
```

Expected output: `OK: function exists, rows=0` (zero rows because UUID doesn't exist — that's fine).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_find_similar_hotels.sql
git commit -m "feat(db): add find_similar_hotels pg_trgm function (migration 007)"
```

---

## Task 12: Hotel matching — queries.ts

**Files:**
- Modify: `packages/scrapers/src/db/queries.ts`

- [ ] **Step 1: Add findSimilarHotelsByName**

In `packages/scrapers/src/db/queries.ts`, after the `getHotelsByDestination` function add:

```typescript
/**
 * Find hotels with similar normalized names using pg_trgm similarity.
 * Replaces in-memory Fuse.js search — uses GIN index on normalized_name.
 * Returns up to 3 candidates sorted by similarity DESC.
 */
export async function findSimilarHotelsByName(
  normalizedName: string,
  destinationId: string,
): Promise<ExistingHotelRecord[]> {
  const { data, error } = await supabase.rpc('find_similar_hotels', {
    p_normalized_name: normalizedName,
    p_destination_id: destinationId,
    p_min_similarity: 0.45,
  });

  if (error) {
    logger.warn('find_similar_hotels RPC failed, falling back to empty', {
      error: error.message,
      normalizedName,
    });
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((h: any) => ({
    id: h.id as string,
    canonicalName: h.canonical_name as string,
    normalizedName: h.normalized_name as string,
    destinationId: h.destination_id as string,
    stars: Number(h.stars),
  }));
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/scrapers && pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/scrapers/src/db/queries.ts
git commit -m "feat(db): add findSimilarHotelsByName using pg_trgm RPC"
```

---

## Task 13: Hotel matching — HotelNormalizer + orchestrator

**Files:**
- Modify: `packages/scrapers/src/normalizer/HotelNormalizer.ts`
- Modify: `packages/scrapers/src/orchestrator.ts`
- Modify: `packages/scrapers/package.json`

- [ ] **Step 1: Remove Fuse.js from HotelNormalizer.ts**

In `packages/scrapers/src/normalizer/HotelNormalizer.ts`:

Remove:
```typescript
import Fuse from 'fuse.js';
```

Remove the `computeHotelNameSimilarity` function entirely.

Keep all of: `normalizeHotelName`, `generateCanonicalName`, `normalizeBoardType`, `CONFIDENCE_THRESHOLDS`, `ExistingHotelRecord`, `HotelMatch`, `NormalizedHotel`.

- [ ] **Step 2: Replace findBestHotelMatch with selectBestHotelMatch**

Remove the old `findBestHotelMatch` function. Add:

```typescript
/**
 * Select the best hotel match from pg_trgm candidates.
 * Candidates are pre-filtered at 0.45 similarity by the SQL function,
 * sorted by similarity DESC. First result is the best match.
 */
export function selectBestHotelMatch(
  offer: Pick<RawOffer, 'hotelStars'>,
  candidates: ExistingHotelRecord[],
): HotelMatch {
  if (candidates.length === 0) {
    return { existingHotelId: null, confidenceScore: 0, isNewHotel: true };
  }

  const best = candidates[0]!;

  // Boost confidence when stars match (same heuristic as previous Fuse.js version)
  const starBoost = offer.hotelStars === best.stars ? 0.05 : 0;
  // pg_trgm already filtered at 0.45; first result represents high similarity
  const confidenceScore = Math.min(1, 0.80 + starBoost);

  return {
    existingHotelId: best.id,
    confidenceScore,
    isNewHotel: false,
  };
}
```

- [ ] **Step 3: Update orchestrator.ts imports**

In `packages/scrapers/src/orchestrator.ts`:

Change the HotelNormalizer import:
```typescript
import {
  selectBestHotelMatch,
  generateCanonicalName,
  normalizeHotelName,
  CONFIDENCE_THRESHOLDS,
} from './normalizer/HotelNormalizer.js';
```

Add `findSimilarHotelsByName` to the db/queries import:
```typescript
import {
  getProviderByCode,
  createSearchRun,
  updateSearchRun,
  getDestinationByCanonical,
  upsertHotel,
  upsertHotelAlias,
  insertOffers,
  markProviderOffersUnavailable,
  upsertHotelReviewSummary,
  insertHotelPhotos,
  updateHotelMedia,
  expireStuckRuns,
  recalculateScores,
  insertScrapeLogs,
  findSimilarHotelsByName,
} from './db/queries.js';
```

(Remove `getHotelsByDestination` from this list — no longer used.)

- [ ] **Step 4: Update the hotel matching loop in orchestrator.ts**

In `runScrape`, find the per-destination loop. Remove:
```typescript
// Load existing hotels for this destination
const existingHotels = destinationId
  ? await getHotelsByDestination(destinationId)
  : [];
```

And inside the `for (const rawOffer of destOffers)` loop, replace:
```typescript
const match = findBestHotelMatch(rawOffer, existingHotels, destinationId ?? '');
```

With:
```typescript
const normalizedName = normalizeHotelName(generateCanonicalName(rawOffer));
const candidates = destinationId
  ? await findSimilarHotelsByName(normalizedName, destinationId)
  : [];
const match = selectBestHotelMatch(rawOffer, candidates);
```

Also remove the `existingHotels.push({...})` block that was adding newly created hotels to the local cache — `upsertHotel` handles exact-name deduplication at the DB level.

- [ ] **Step 5: Remove fuse.js dependency**

In `packages/scrapers/package.json`, remove from `"dependencies"`:
```json
"fuse.js": "^7.0.0",
```

Run:
```bash
cd packages/scrapers && pnpm install
```

- [ ] **Step 6: Verify TypeScript and tests**

```bash
cd packages/scrapers && pnpm type-check && pnpm test
```

Expected: no type errors, all 5 test files pass (they don't test orchestrator, so no change there).

- [ ] **Step 7: Run a one-provider scrape to verify end-to-end**

```bash
cd packages/scrapers && pnpm scrape:rpl
```

Watch the output for:
- `[rpl] sanity OK: N offers` — retry + sanity check working
- `Hotels created: N, Hotels matched: M` — pg_trgm matching working
- No `find_similar_hotels RPC failed` errors

- [ ] **Step 8: Commit**

```bash
git add packages/scrapers/src/normalizer/HotelNormalizer.ts packages/scrapers/src/orchestrator.ts packages/scrapers/package.json
git commit -m "feat(matching): replace Fuse.js with pg_trgm hotel matching — remove fuse.js dep"
```

---

## Definition of Done

Run these checks after all 13 tasks:

```bash
# 1. All tests pass
cd packages/scrapers && pnpm test
# Expected: Test Files: 5 passed, Tests: ≥15 passed

# 2. No coral references anywhere
grep -r "coral" packages/scrapers/src packages/shared/src
# Expected: (no output)

# 3. No fuse.js imports
grep -r "fuse" packages/scrapers/src
# Expected: (no output)

# 4. TypeScript clean
pnpm -r type-check
# Expected: (no errors)

# 5. One-provider scrape returns ≥10 offers
cd packages/scrapers && pnpm scrape:grecos
# Expected: "sanity OK: ≥10 offers", "Offers inserted: ≥10"
```
