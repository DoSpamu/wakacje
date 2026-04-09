# Jak dodać nowe biuro podróży (adapter)

Ten przewodnik opisuje jak dodać kolejny provider w ~30 minut.

## 1. Utwórz katalog adaptera

```bash
mkdir -p packages/scrapers/src/providers/NAZWA
```

## 2. Utwórz `config.ts`

Plik konfiguracyjny z selektorami CSS i ustawieniami:

```typescript
// packages/scrapers/src/providers/NAZWA/config.ts

export const NAZWA_SELECTORS = {
  resultsContainer: '.wyniki, [class*="Results"]',
  offerCard: '.oferta, [class*="Offer"]',
  hotelName: '.nazwa-hotelu, h2',
  hotelStars: '.gwiazdki, [class*="Stars"]',
  hotelLocation: '.lokalizacja, [class*="Location"]',
  departureDate: '.data-wylotu, [class*="Date"]',
  nights: '.noce, [class*="Nights"]',
  boardType: '.wyzywienie, [class*="Board"]',
  priceTotal: '.cena strong',
  pricePerPerson: '.cena-per-osoba',
  offerLink: 'a[href*="/oferta"]',
  departureAirport: '.lotnisko, [class*="Airport"]',
  loadingSpinner: '.ladowanie, [class*="Spinner"]',
  loadMoreBtn: 'button:has-text("Więcej")',
  noResults: '[class*="BrakWynikow"]',
};

export const NAZWA_CONFIG = {
  resultsTimeout: 30_000,
  maxPages: 15,
  baseUrl: 'https://www.NAZWA.pl',
};
```

> **Jak znaleźć selektory:**
> 1. Otwórz stronę z wynikami wyszukiwania
> 2. DevTools → Inspect → znajdź element karty oferty
> 3. Skopiuj data-testid lub unikalny class name

## 3. Utwórz `parser.ts`

```typescript
// packages/scrapers/src/providers/NAZWA/parser.ts
import type { Page } from 'playwright';
import type { RawOffer } from '@wakacje/shared';

export function parseNazwaPrice(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
}

export function parseNazwaBoardType(raw: string): RawOffer['boardType'] {
  const lower = raw.toLowerCase();
  if (lower.includes('all inclusive') || lower.includes('ai')) return 'all-inclusive';
  // ... dodaj pozostałe
  return 'unknown';
}

export async function parseNazwaPage(page: Page, sourceUrl: string): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];
  const cards = page.locator(NAZWA_SELECTORS.offerCard);
  const count = await cards.count();

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    // ... parsuj kartę
    const offer: RawOffer = {
      providerCode: 'nazwa',
      hotelName: await card.locator(NAZWA_SELECTORS.hotelName).innerText(),
      // ... pozostałe pola
    };
    offers.push(offer);
  }

  return offers;
}
```

## 4. Utwórz `NazwaScraper.ts`

```typescript
// packages/scrapers/src/providers/NAZWA/NazwaScraper.ts
import type { Page } from 'playwright';
import type { RawOffer, SearchFilter } from '@wakacje/shared';
import { BaseScraper } from '../../base/BaseScraper.js';
import { parseNazwaPage } from './parser.js';
import { NAZWA_SELECTORS, NAZWA_CONFIG } from './config.js';

export class NazwaScraper extends BaseScraper {
  readonly providerCode = 'nazwa' as const;
  readonly baseUrl = 'https://www.nazwa.pl';
  readonly selectors = NAZWA_SELECTORS;

  protected buildSearchUrls(filter: SearchFilter): string[] {
    // Przetłumacz canonical filter na URL parametry NAZWA
    const params = new URLSearchParams();
    params.set('od', filter.departureAirports.join(','));
    params.set('dorosli', filter.adults.toString());
    // ... etc.

    return [`${this.baseUrl}/szukaj?${params.toString()}`];
  }

  protected async parsePage(page: Page, url: string): Promise<RawOffer[]> {
    return parseNazwaPage(page, url);
  }

  protected async waitForResults(page: Page): Promise<void> {
    await page.waitForSelector(NAZWA_SELECTORS.offerCard, {
      timeout: NAZWA_CONFIG.resultsTimeout,
    });
  }

  protected async goToNextPage(page: Page): Promise<boolean> {
    const btn = page.locator(NAZWA_SELECTORS.loadMoreBtn).first();
    if (await btn.isVisible({ timeout: 2000 })) {
      const prev = await page.locator(NAZWA_SELECTORS.offerCard).count();
      await btn.click();
      await page.waitForTimeout(2500);
      const curr = await page.locator(NAZWA_SELECTORS.offerCard).count();
      return curr > prev;
    }
    return false;
  }
}
```

## 5. Dodaj mapowanie destynacji

W `packages/shared/src/config/destinations.ts` dodaj do każdej destynacji:

```typescript
nazwa: {
  slugs: ['turcja', 'turkey'],     // sprawdź URL providera
  displayName: 'Turcja',
},
```

## 6. Zarejestruj provider w orchestratorze

W `packages/scrapers/src/orchestrator.ts`:

```typescript
import { NazwaScraper } from './providers/nazwa/NazwaScraper.js';

const PROVIDER_SCRAPERS = {
  rpl: RplScraper,
  exim: EximScraper,
  // ...
  nazwa: NazwaScraper,  // ← dodaj tutaj
} as const;
```

## 7. Dodaj provider do bazy danych

W `packages/scrapers/src/seed.ts` dodaj do `PROVIDERS`:

```typescript
{ code: 'nazwa', name: 'Nazwa Biura', base_url: 'https://www.nazwa.pl', is_active: true },
```

Uruchom: `pnpm seed`

## 8. Dodaj typ do `@wakacje/shared`

W `packages/shared/src/types/offer.ts`:

```typescript
export type ProviderCode = 'rpl' | 'exim' | 'coral' | 'itaka' | 'grecos' | 'tui' | 'nazwa';
```

## 9. Przetestuj

```bash
# Uruchom scraper w trybie headful (widzisz przeglądarkę)
SCRAPER_HEADLESS=false pnpm --filter @wakacje/scrapers exec node --loader ts-node/esm src/run.ts nazwa

# Lub z zapisem snapshot dla debugowania
SCRAPER_SAVE_SNAPSHOTS=true pnpm --filter @wakacje/scrapers exec node --loader ts-node/esm src/run.ts nazwa
# Snapshots w: packages/scrapers/snapshots/
```

## Checklist

- [ ] `config.ts` z selektorami
- [ ] `parser.ts` z funkcjami parsowania
- [ ] `NazwaScraper.ts` rozszerzający `BaseScraper`
- [ ] Mapowanie destynacji w `destinations.ts`
- [ ] Rejestracja w `orchestrator.ts`
- [ ] Provider w `seed.ts`
- [ ] Typ `ProviderCode` zaktualizowany
- [ ] Selektory zweryfikowane ręcznie
