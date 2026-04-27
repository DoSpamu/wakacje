# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Polish vacation offer aggregator. Scrapes travel agencies (R.pl, Exim Tours, Itaka, Grecos, TUI, Wakacje.pl), deduplicates hotels across providers, enriches with TripAdvisor/Booking.com/YouTube data, and serves a Next.js search UI backed by Supabase.

## Monorepo Structure

- **`packages/scrapers`** — scraper engine (Node.js, Patchright/Playwright, runs in GitHub Actions)
- **`apps/web`** — Next.js 14 frontend + API routes (deployed on Vercel)
- **`packages/shared`** — shared TypeScript types (`RawOffer`, `SearchFilter`, `ProviderCode`, etc.)
- **`supabase/migrations/`** — numbered SQL migrations (apply manually in Supabase SQL Editor)

## Common Commands

```bash
# Development
pnpm dev                         # start Next.js dev server
pnpm build                       # build all packages via Turborepo
pnpm type-check                  # TypeScript check across monorepo

# Scraping (reads from root .env)
pnpm scrape                      # all providers
pnpm scrape:itaka                # single provider
pnpm scrape:rpl                  # etc.

# Enrichment (TripAdvisor + Booking + YouTube)
cd packages/scrapers
node --env-file=../../.env --import=tsx/esm src/enrich.ts 50        # enrich 50 hotels
node --env-file=../../.env --import=tsx/esm src/enrich.ts 50 --force  # re-enrich

# Tests (scrapers package only)
cd packages/scrapers && pnpm test
pnpm test:watch
pnpm test:coverage

# DB seed (inserts providers + destinations)
pnpm seed

# Format
pnpm format
```

## Architecture — Data Flow

```
Playwright Scrapers (patchright)
  → RawOffer[]
  → OfferNormalizer (normalize fields, infer destination)
  → HotelNormalizer (pg_trgm fuzzy match → upsert hotels)
  → Supabase: offers, hotels, hotel_aliases tables
  → TripAdvisorEnricher (Patchright) → hotel_reviews_summary
  → BookingReviewEnricher (plain fetch, lang=pl) → hotel_reviews_summary
  → YouTubeEnricher (API) → hotels.youtube_video_id
  → recalculateScores() → offers.composite_score (0–100)
```

**Frontend query path:** `page.tsx` → `GET /api/offers` → `offers_enriched` Postgres view → Supabase REST API

**Live search** (bypasses DB): `GET /api/live-search` (SSE) → two async generators run in `Promise.all` → streams `{type:'batch'}` events. Itaka and Wakacje.pl use SSR `__NEXT_DATA__` extraction (plain `fetch()`). Grecos/TUI use Playwright so they cannot do live search.

## Scraper Provider Pattern

Each provider lives in `packages/scrapers/src/providers/{name}/` with:
- `{Name}Scraper.ts` — extends `BaseScraper`, implements `buildSearchUrls()` and `parsePage()`
- `config.ts` — selectors, destination slug mappings, board type mappings
- `parser.ts` — HTML/JSON parsing logic

`BaseScraper` handles browser lifecycle (Patchright), rate limiting (8 req/min), retries, and snapshot saving. The orchestrator runs providers concurrently (default: 2 at a time), applies `scrapeWithRetry` (2 attempts, 5s/10s delays), and validates results with a sanity check (≥5 offers).

**To add a new provider:**
1. Add folder + class extending `BaseScraper` with `providerCode`, `baseUrl`, `selectors`
2. Register in `orchestrator.ts` `PROVIDER_SCRAPERS` map
3. Insert provider row via `pnpm seed` or SQL
4. For live search (SSR-only): add generator in `apps/web/lib/live-search/` and wire into `app/api/live-search/route.ts`

## Key Database Tables

| Table | Purpose |
|---|---|
| `offers` | Raw scraped offers (price, dates, board type, source_url) |
| `hotels` | Deduplicated hotel master records (canonical_name, normalized_name) |
| `hotel_aliases` | Per-provider hotel name → hotel_id mappings with confidence score |
| `hotel_reviews_summary` | TripAdvisor + Booking + Google reviews per hotel, per source |
| `hotel_photos` | Hotel photo URLs from TripAdvisor |
| `providers` | Travel agency registry (rpl, exim, coral, itaka, grecos, tui, wakacjepl) |
| `destinations` | Canonical destinations (turkey, egypt, etc.) |
| `search_runs` | One row per scrape run per provider; tracks status/offer count |
| `price_alerts` | User email + hotel + threshold for price drop notifications |

**Key view:** `offers_enriched` — the main query target for the frontend. Joins `offers` + `providers` + `destinations` + `hotels` + `hotel_reviews_summary` (TA + Google). Always filter `is_available = true`.

## Hotel Deduplication

`HotelNormalizer.ts` + `pg_trgm` DB function (`find_similar_hotels`). Flow:
1. Strip diacritics, lowercase, remove common suffixes (Hotel, Resort, etc.) → `normalized_name`
2. Call `supabase.rpc('find_similar_hotels', { name, destination_id })` → candidates with similarity score
3. `findBestHotelMatch()` picks best match above `CONFIDENCE_THRESHOLDS.MEDIUM` (0.65)
4. Below threshold → create new hotel record

## Composite Score

`scoring.ts` produces 0–100 per offer. Weights: price (lower = better), TA overall rating, food score, rooms/cleanliness, hotel stars, review count confidence. Recalculated after every scrape via `recalculateScores()` which runs a SQL update across the current `offers` set.

## Environment Variables

Local: root `.env` (scrapers), `apps/web/.env.local` (web).

| Variable | Where used |
|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Supabase |
| `SCRAPER_HEADLESS` | `false` for debugging browser |
| `ENABLE_ENRICHMENT` | Set `false` to skip TripAdvisor during scrape |
| `SCRAPER_SAVE_SNAPSHOTS` | `true` saves HTML to `./snapshots/` for debugging |
| `YOUTUBE_API_KEY` | Optional; YouTube enrichment skipped if absent |
| `SCRAPE_API_SECRET` | Auth for `POST /api/scrape` UI trigger |
| `GITHUB_TOKEN` + `GITHUB_REPO` | Cron routes trigger GitHub Actions workflows |
| `CRON_SECRET` | Vercel cron → API route authentication |
| `RESEND_API_KEY` | Price alert emails |

## Automation (GitHub Actions + Vercel Cron)

- `.github/workflows/scrape.yml` — scrape + enrich, runs at 08:30 and 15:00 PL; `workflow_dispatch` from `POST /api/scrape`
- `.github/workflows/enrich.yml` — standalone enrichment at 04:00 PL; triggered by `GET /api/cron/enrich`
- `vercel.json` crons:
  - `0 3 * * *` → `/api/cron/enrich` (triggers enrich.yml)
  - `0 8,14,20 * * *` → `/api/cron/price-alerts` (checks price alerts, sends via Resend)

## Supabase Migrations

No CLI auto-migration. Apply numbered files from `supabase/migrations/` manually in Supabase SQL Editor in order (001 → 008). The `pnpm migrate` script requires `SUPABASE_ACCESS_TOKEN` (management API token).
