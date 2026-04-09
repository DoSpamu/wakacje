# Wakacje Aggregator

Narzędzie do agregacji ofert wakacyjnych z polskich biur podróży, analizy jakości hoteli i porównywania cen.

## Obsługiwane biura podróży

| Kod | Biuro | Status |
|-----|-------|--------|
| `rpl` | R.pl | Pełna implementacja |
| `exim` | Exim Tours | Pełna implementacja |
| `coral` | Coral Travel Polska | Pełna implementacja |
| `itaka` | Itaka | Pełna implementacja |
| `grecos` | Grecos Holiday | Pełna implementacja |
| `tui` | TUI Poland | Pełna implementacja |

## Architektura

```
monorepo (pnpm workspaces)
├── packages/
│   ├── shared/          # Typy, schematy Zod, konfiguracja
│   └── scrapers/        # Playwright scrapers + enrichment
└── apps/
    └── web/             # Next.js 14 frontend (Vercel)
```

**Dane:** Supabase (PostgreSQL)  
**Scraper:** Playwright + Node.js  
**Frontend:** Next.js 14 + Tailwind CSS  
**Export:** ExcelJS (XLSX) + CSV

## Wymagania

- Node.js ≥ 20
- pnpm ≥ 9
- Konto Supabase

## Instalacja

```bash
# 1. Klonuj repo
git clone <url>
cd wakacje

# 2. Zainstaluj zależności
pnpm install

# 3. Zainstaluj Playwright browsers
pnpm --filter @wakacje/scrapers exec playwright install chromium

# 4. Skonfiguruj zmienne środowiskowe
cp .env.example .env
# Uzupełnij SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 5. Utwórz schemat bazy
# Wklej zawartość supabase/migrations/*.sql do Supabase SQL Editor
# (w kolejności: 001, 002, 003, 004)

# 6. Załaduj dane testowe
pnpm seed

# 7. Uruchom aplikację webową
pnpm dev
```

Aplikacja dostępna pod: http://localhost:3000

## Konfiguracja scrapera

Scraper konfigurowany przez zmienne środowiskowe (plik `.env`):

```env
# Lotniska wylotu
SCRAPE_AIRPORTS=KTW,KRK

# Kierunki (canonical keys)
SCRAPE_DESTINATIONS=turkey,egypt,greece,spain,cyprus

# Daty
SCRAPE_DATE_FROM=2026-04-09
SCRAPE_DATE_TO=2026-06-30

# Liczba nocy
SCRAPE_NIGHTS_MIN=7
SCRAPE_NIGHTS_MAX=14

# Dorośli
SCRAPE_ADULTS=2

# Gwiazdki hotelowe
SCRAPE_STARS=4,5

# Wyżywienie
SCRAPE_BOARD_TYPES=all-inclusive,ultra-all-inclusive
```

## Uruchomienie scrapera

```bash
# Wszystkie biura
pnpm scrape

# Tylko R.pl
pnpm scrape:rpl

# Tylko Exim Tours
pnpm scrape:exim

# Tylko Itaka
pnpm --filter @wakacije/scrapers run scrape itaka

# Wiele biur
node --loader ts-node/esm packages/scrapers/src/run.ts rpl,exim,itaka
```

## Deploy na Vercel

### 1. Aplikacja webowa

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/web
vercel

# Ustaw zmienne środowiskowe w Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# SCRAPE_API_SECRET
```

### 2. Scraper (osobny serwer)

Scraper używa Playwright i nie może działać na Vercel (brak przeglądarki).

**Opcje:**
- **GitHub Actions** (cron) — patrz `docs/deployment.md`
- **Railway** — deploy `packages/scrapers` jako worker
- **DigitalOcean** / VPS — cron job
- **Lokalnie** — ręczne uruchamianie

## Konfiguracja scoringu

Plik `scoring.config.json` zawiera wagi dla systemu scoringu:

```json
{
  "weights": {
    "priceNormalized": 0.20,
    "foodScore": 0.25,
    "roomsScore": 0.18,
    ...
  }
}
```

Aby użyć własnej konfiguracji:
```env
SCORING_CONFIG_PATH=./scoring.config.json
```

## Jak dodać nowe biuro podróży

Patrz `docs/adding-provider.md`.

## Struktura bazy danych

```
providers
destinations
hotels
  └─ hotel_aliases (mapowanie nazw między biurami)
search_runs
offers (główna tabela ofert)
hotel_reviews_summary (dane TripAdvisor / Google)
scrape_logs
```

Schemat: `supabase/migrations/001_initial_schema.sql`
