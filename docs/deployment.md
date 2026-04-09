# Deployment Guide

## Architektura deploymentu

```
┌────────────────────────────────────┐
│  Vercel (Next.js frontend)         │
│  - Serwuje aplikację webową        │
│  - API routes (read from Supabase) │
│  - Export XLSX/CSV                 │
└────────────────┬───────────────────┘
                 │ read
                 ▼
┌────────────────────────────────────┐
│  Supabase (PostgreSQL)             │
│  - Baza danych                     │
│  - RLS policies                    │
│  - Views (offers_enriched)         │
└────────────────▲───────────────────┘
                 │ write
┌────────────────────────────────────┐
│  Scraper (oddzielny proces)        │
│  - GitHub Actions (cron)           │
│  - lub Railway / VPS               │
│  - lub lokalnie                    │
└────────────────────────────────────┘
```

---

## 1. Supabase — konfiguracja bazy danych

### 1a. Utwórz projekt

1. Wejdź na https://app.supabase.com
2. Kliknij "New project"
3. Wybierz region EU (Frankfurt) — mniejsze opóźnienia z PL
4. Zanotuj: **Project URL**, **anon key**, **service_role key**

### 1b. Uruchom migracje SQL

W Supabase Dashboard → SQL Editor, wklej i uruchom kolejno:

```sql
-- Plik: supabase/migrations/001_initial_schema.sql
-- Plik: supabase/migrations/002_indexes.sql
-- Plik: supabase/migrations/003_rls_policies.sql
-- Plik: supabase/migrations/004_views.sql
```

### 1c. Załaduj dane testowe

```bash
# Uzupełnij .env z kluczami Supabase, następnie:
pnpm seed
```

---

## 2. Vercel — deploy frontendu

### 2a. Zainstaluj Vercel CLI

```bash
npm i -g vercel
```

### 2b. Deploy

```bash
cd apps/web
vercel
# Postępuj zgodnie z instrukcjami CLI
```

### 2c. Zmienne środowiskowe w Vercel

W Dashboard projektu → Settings → Environment Variables:

| Zmienna | Wartość |
|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJ... (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... (service role key) |
| `SCRAPE_API_SECRET` | losowy string (np. openssl rand -hex 32) |

### 2d. Vercel Cron (opcjonalne — tylko dla prostych tasków)

Vercel Cron może wywołać `/api/scrape` ale scraper nie może działać na Vercel Serverless.
Zamiast tego użyj GitHub Actions (patrz poniżej).

---

## 3. GitHub Actions — automatyczny scraping

Utwórz plik `.github/workflows/scrape.yml`:

```yaml
name: Scrape vacation offers

on:
  schedule:
    - cron: '0 6 * * *'   # Codziennie o 6:00 UTC
    - cron: '0 18 * * *'  # I o 18:00 UTC
  workflow_dispatch:        # Manualnie z GitHub UI

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: pnpm --filter @wakacje/scrapers exec playwright install chromium --with-deps

      - name: Run scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          SCRAPE_AIRPORTS: KTW,KRK
          SCRAPE_DATE_FROM: ${{ env.TODAY }}
          SCRAPE_DATE_TO: ${{ env.IN_90_DAYS }}
          SCRAPE_NIGHTS_MIN: 7
          SCRAPE_NIGHTS_MAX: 14
          SCRAPE_ADULTS: 2
          SCRAPE_STARS: 4,5
          SCRAPER_HEADLESS: true
          SCRAPER_DELAY_MS: 2500
        run: |
          export TODAY=$(date -u +%Y-%m-%d)
          export IN_90_DAYS=$(date -u -d '+90 days' +%Y-%m-%d 2>/dev/null || date -u -v+90d +%Y-%m-%d)
          pnpm scrape
```

Dodaj secrets w GitHub → Settings → Secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 4. Railway — alternatywny hosting scrapera

Railway pozwala uruchomić scraper jako scheduled job:

1. Utwórz nowy projekt na https://railway.app
2. Połącz z repo GitHub
3. Dodaj zmienne środowiskowe
4. Ustaw **Start Command**: `node --loader ts-node/esm packages/scrapers/src/run.ts all`
5. Dodaj **Cron Schedule**: `0 6 * * *`

---

## 5. Zmiana terminu urlopu (migracja filtrów)

Aby zmienić wyszukiwane terminy **bez zmiany kodu**:

```bash
# Opcja 1: .env
SCRAPE_DATE_FROM=2026-06-01
SCRAPE_DATE_TO=2026-08-31
SCRAPE_NIGHTS_MIN=10
SCRAPE_NIGHTS_MAX=14

# Opcja 2: przez UI scrape trigger
# POST /api/scrape z body:
{
  "dateFrom": "2026-06-01",
  "dateTo": "2026-08-31"
}
```

---

## Troubleshooting

### Scraper nie widzi wyników

1. Sprawdź snapshot: `SCRAPER_SAVE_SNAPSHOTS=true pnpm scrape:rpl`
2. Otwórz `packages/scrapers/snapshots/rpl_*.html` w przeglądarce
3. Zaktualizuj selektory w `packages/scrapers/src/providers/rpl/config.ts`

### Supabase: błąd RLS

Upewnij się że używasz **service_role_key** (nie anon) w scraperze.

### XLSX export za duży

Zmień limit w `apps/web/app/api/export/route.ts`:
```typescript
.limit(2000) // zmień na mniej
```
