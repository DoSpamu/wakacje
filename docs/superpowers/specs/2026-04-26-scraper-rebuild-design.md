# Scraper Rebuild Design — 2026-04-26

## Cel

Przebudowa warstwy scrapingu (packages/scrapers) w celu eliminacji 5 problemów:

1. Coral Travel zablokowany przez Incapsula → **usuwamy providera**
2. Parsery kruche (coupled z Playwright) → **pure functions + fixture tests**
3. Brak testów → **Vitest + spy fixtures**
4. Orchestrator bez retry i sanity check → **retry per-provider + walidacja output**
5. Hotel matching generuje duplikaty (Fuse.js) → **pg_trgm w PostgreSQL**

**Nie zmieniamy:** schema Supabase, monorepo structure, GitHub Actions workflow, frontend, scoring engine.

---

## Architektura

Przebudowa przebiega w 5 kroków — każdy niezależnie commitable:

```
Krok 1  ──  Usuń Coral
Krok 2  ──  Refaktor parserów → pure functions
Krok 3  ──  Vitest fixtures dla 5 providerów
Krok 4  ──  Orchestrator: retry + sanity check
Krok 5  ──  Hotel matching: Fuse.js → pg_trgm
```

Zasada: każdy krok kończymy z `pnpm test` na zielono zanim zaczynamy następny.

---

## Krok 1 — Usuń Coral

**Pliki do usunięcia:**
- `packages/scrapers/src/providers/coral/` (cały katalog)

**Pliki do edycji:**
- `packages/scrapers/src/orchestrator.ts` — usuń CoralScraper z importów i tablicy providerów
- `packages/scrapers/src/run.ts` — usuń `'coral'` z listy providerów
- `packages/shared/src/types/offer.ts` — usuń `'coral'` z `ProviderCode`
- Root `package.json` — usuń skrypt `scrape:coral`

**Pliki do .gitignore:**
- `packages/scrapers/src/spy-deep.ts`
- `packages/scrapers/src/spy-network.ts`
- `packages/scrapers/spy-*.json`

(Spy tools zostawiamy jako pliki lokalne — przydatne do debugowania, ale nie commitujemy.)

---

## Krok 2 — Parser refactor: pure functions

### Problem

Aktualnie `parser.ts` każdego providera jest częściowo coupled z klasą scrapera — ma dostęp do `this.page`, `this.logger`, instancji Playwright. Nie można go przetestować bez uruchamiania przeglądarki.

### Rozwiązanie

Każdy `parser.ts` staje się modułem z jedną eksportowaną funkcją:

```typescript
// Dla parserów HTML:
export function parseOffers(html: string): RawOffer[]

// Dla parserów JSON (Itaka, TUI):
export function parseOffers(data: unknown): RawOffer[]
```

**Zasady dla parser.ts:**
- Zero importów z Playwright / patchright
- Zero importów logger
- Zero referencji do `this.*`
- Błędy: rzucaj wyjątkami (`throw new Error(...)`) — nie loguj
- Zwracaj `[]` jeśli strona nie zawiera ofert (np. pusta strona paginacji)

**Zmiany w klasach scraperów (TuiScraper.ts itp.):**
```typescript
// Przed:
const offers = await this.parsePage(page, url)  // metoda klasy

// Po:
const html = await page.content()
const offers = parseOffers(html)  // pure function call
```

Logika nawigacji, paginacji i rate limitingu zostaje w klasie — nie ruszamy.

### Kolejność refaktoru (od najprostszego):
1. `rpl/parser.ts` — DOM scraping, prosty HTML
2. `grecos/parser.ts` — DOM fallback
3. `tui/parser.ts` — JSON-LD parsing
4. `exim/parser.ts` — route interception JSON
5. `itaka/parser.ts` — React Query initialQueryState (najbardziej złożony)

---

## Krok 3 — Vitest fixtures

### Instalacja

```json
// packages/scrapers/package.json — devDependencies:
"vitest": "^2.0.0",
"@vitest/coverage-v8": "^2.0.0"
```

Konfiguracja `packages/scrapers/vitest.config.ts`:
```typescript
export default {
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  }
}
```

### Struktura fixtures

```
packages/scrapers/src/providers/
├── rpl/
│   ├── parser.ts
│   ├── parser.test.ts        ← NOWY
│   └── fixtures/
│       └── search-results.html  ← zrzut prawdziwej strony (git-committed)
├── tui/
│   ├── parser.ts
│   ├── parser.test.ts
│   └── fixtures/
│       └── api-response.json    ← spy-tui.json przemianowany
...
```

### Struktura testu (template)

```typescript
// rpl/parser.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseOffers } from './parser'

const html = readFileSync(join(__dirname, 'fixtures/search-results.html'), 'utf-8')

describe('rpl parser', () => {
  it('parses offers from fixture', () => {
    const offers = parseOffers(html)
    expect(offers.length).toBeGreaterThan(0)
  })

  it('offer has required fields', () => {
    const offers = parseOffers(html)
    const offer = offers[0]
    expect(offer.hotelName).toBeTruthy()
    expect(offer.pricePerPerson).toBeGreaterThan(0)
    expect(offer.boardType).toBeTruthy()
  })

  it('prices are in PLN range (500–50000)', () => {
    const offers = parseOffers(html)
    offers.forEach(o => {
      expect(o.pricePerPerson).toBeGreaterThanOrEqual(500)
      expect(o.pricePerPerson).toBeLessThanOrEqual(50000)
    })
  })
})
```

### Jak zdobyć fixtures

**HTML providers (rpl, grecos):** Dodajemy tymczasową linię do scrapera:
```typescript
import { writeFileSync } from 'fs'
writeFileSync('fixtures/search-results.html', await page.content())
```
Uruchamiamy scraper raz, commitujemy plik, usuwamy linię.

**JSON providers:**
- TUI: `packages/scrapers/spy-tui.json` → kopiujemy do `tui/fixtures/api-response.json`
- Itaka: `node --import=tsx/esm src/spy-deep.ts itaka` lokalnie → kopiujemy wynik
- Exim: `node --import=tsx/esm src/spy-deep.ts exim` lokalnie → kopiujemy wynik

### Skrypt testowy

```json
// packages/scrapers/package.json scripts:
"test": "vitest run",
"test:watch": "vitest"
```

---

## Krok 4 — Orchestrator: retry + sanity check

### Retry per-provider

Aktualnie jeśli provider crashuje → cały run kontynuuje bez retry. Po zmianie:

```typescript
// orchestrator.ts — wrapper dla każdego providera
async function scrapeWithRetry(
  scraper: BaseScraper,
  filter: SearchFilter,
  maxAttempts = 2
): Promise<ScraperResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await scraper.scrape(filter)
    } catch (err) {
      if (attempt === maxAttempts) throw err
      logger.warn(`[${scraper.providerCode}] attempt ${attempt} failed, retrying...`)
      await sleep(5000 * attempt)  // 5s, 10s
    }
  }
}
```

### Sanity check po scrape

Po zakończeniu każdego providera, przed zapisem do DB:

```typescript
function validateResult(code: ProviderCode, offers: RawOffer[]): void {
  if (offers.length < 5) {
    logger.warn(`[${code}] sanity FAIL: only ${offers.length} offers (expected ≥5)`)
    // NIE rzucamy błędu — zapisujemy co mamy, ale logujemy ostrzeżenie
  }
  const badPrices = offers.filter(o => o.pricePerPerson < 500 || o.pricePerPerson > 50000)
  if (badPrices.length > 0) {
    logger.warn(`[${code}] ${badPrices.length} offers with suspicious prices`)
  }
}
```

Sanity check loguje ostrzeżenia — nie blokuje zapisu. Logi widoczne w GitHub Actions output.

---

## Krok 5 — Hotel matching: Fuse.js → pg_trgm

### Problem z Fuse.js

Fuse.js robi matching w pamięci: ładuje wszystkie hotele z DB → szuka fuzzy w JS. Problemy:
- Threshold 0.85 generuje false negatives (różne pisownie tego samego hotelu)
- Threshold 0.50 generuje false positives (różne hotele)
- Przy 1000+ hotelach w DB: wolne i pamięciożerne

### Rozwiązanie: pg_trgm (już zainstalowany)

`pg_trgm` liczy trigram similarity bezpośrednio w PostgreSQL. Zapytanie:

```sql
SELECT id, canonical_name,
       similarity(normalized_name, $1) AS sim
FROM hotels
WHERE destination_id = $2
  AND similarity(normalized_name, $1) > 0.45
ORDER BY sim DESC
LIMIT 3;
```

**Progi (identyczne jak Fuse.js logika):**
- `sim >= 0.85` → automatyczne dopasowanie
- `0.45 <= sim < 0.85` → dopasowanie z flagą `needs_review`
- brak wyników → nowy hotel

### Zmiany w kodzie

**Plik:** `packages/scrapers/src/normalizer/HotelNormalizer.ts`

- Usuń import Fuse.js
- Zamień `loadAllHotels()` + fuzzy search → jedno zapytanie SQL `findSimilarHotels(normalizedName, destinationId)`
- Próg i logika dopasowania zostają takie same

**Migracja:** brak zmian w schema — `pg_trgm` i kolumna `normalized_name` już istnieją (migration 002).

**Wydajność:** indeks `hotels_normalized_name_gin_trgm_ops` już jest w migration 002 — zapytanie O(log n) zamiast O(n) w Fuse.js.

---

## Pliki zmieniane (podsumowanie)

| Krok | Pliki |
|------|-------|
| 1 | `providers/coral/*` (DELETE), `orchestrator.ts`, `run.ts`, `types/offer.ts`, `package.json` |
| 2 | `providers/*/parser.ts` (×5), `providers/*/Scraper.ts` (×5) |
| 3 | `vitest.config.ts` (NEW), `providers/*/parser.test.ts` (×5 NEW), `providers/*/fixtures/*` (×5 NEW) |
| 4 | `orchestrator.ts` |
| 5 | `normalizer/HotelNormalizer.ts`, `db/queries.ts` |

---

## Definition of Done

- [ ] `pnpm test` zielony (5 parserów × 3 testy = 15 testów min)
- [ ] `pnpm scrape:rpl` zwraca ≥10 ofert lokalnie
- [ ] Brak importów Coral w codebase (`grep -r coral packages/`)
- [ ] `grep -r 'import.*fuse' packages/scrapers/` zwraca zero wyników
- [ ] GitHub Actions scrape run kończy się z ≥40 łącznymi ofertami
