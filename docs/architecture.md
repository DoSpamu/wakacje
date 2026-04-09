# Architecture Overview

## Warstwy systemu

```
┌─────────────────────────────────────────────────────────────────┐
│  1. WARSTWA PREZENTACJI                                          │
│  apps/web (Next.js 14 + Tailwind)                               │
│  - Formularz wyszukiwania (SearchForm.tsx)                      │
│  - Tabela wyników (OffersTable.tsx)                             │
│  - Karta hotelu (/hotels/[id])                                  │
│  - Porównanie ofert (/compare)                                  │
│  - Historia scrapów (/history)                                  │
│  - Eksport XLSX / CSV (/api/export)                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / Supabase client
┌────────────────────────▼────────────────────────────────────────┐
│  2. WARSTWA DANYCH (Supabase / PostgreSQL)                       │
│  - offers (główna tabela)                                        │
│  - hotels (deduplikowane hotele)                                 │
│  - hotel_aliases (mapowanie nazw między operatorami)            │
│  - hotel_reviews_summary (TripAdvisor / Google)                 │
│  - destinations, providers, search_runs, scrape_logs            │
│  - Widok: offers_enriched (join offers + hotel + reviews)       │
└────────────────────────▲────────────────────────────────────────┘
                         │ Supabase service_role
┌────────────────────────┴────────────────────────────────────────┐
│  3. WARSTWA SCRAPINGU (packages/scrapers)                        │
│                                                                  │
│  Orchestrator                                                    │
│    ├─ RplScraper      → parser.ts, config.ts                    │
│    ├─ EximScraper     → parser.ts, config.ts                    │
│    ├─ CoralScraper    → parser.ts, config.ts                    │
│    ├─ ItakaScraper    → parser.ts, config.ts                    │
│    ├─ GrecosScraper   → parser.ts, config.ts                    │
│    └─ TuiScraper      → parser.ts, config.ts                    │
│         │ Playwright (Chromium)                                  │
│         ▼                                                        │
│  Filter Translator (canonical → provider-specific params)       │
│  Hotel Normalizer (fuzzy matching, deduplication)               │
│  Offer Normalizer (canonical board types, airports, prices)     │
│  TripAdvisor Enricher (ratings, food score, tags)               │
│  Scoring Engine (composite 0-100 score)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Przepływ danych

```
1. Użytkownik ustawia filtr (dates, airports, destinations, stars)
       ↓
2. FilterTranslator konwertuje canonical filter → URL per provider
   np. turkey → {rpl: kraj=turcja, exim: to=1825|1826, coral: country=turcja}
       ↓
3. Playwright otwiera stronę biura podróży z URL
4. Czeka na załadowanie wyników (waitForResults)
5. Parsuje karty ofert (parsePage)
6. Paginacja (goToNextPage) do wyczerpania
       ↓
7. OfferNormalizer:
   - normalizuje boardType ("All Inclusive" → "all-inclusive")
   - normalizuje airport ("Katowice" → "KTW")
   - oblicza returnDate jeśli brakuje
   - inferuje canonical destination z nazwy
       ↓
8. HotelNormalizer:
   - Fuzzy matching z istniejącymi hotelami (Fuse.js)
   - Jeśli confidence >= 0.7: przypisuje istniejący hotel_id
   - Jeśli nowy: tworzy wpis w hotels + hotel_aliases
       ↓
9. TripAdvisor Enrichment (tylko dla nowych hoteli):
   - Szuka hotelu na TripAdvisor
   - Pobiera: overall_rating, food_score, rooms_score, tags
   - Zapisuje do hotel_reviews_summary
       ↓
10. Zapis do Supabase (offers, hotel_aliases)
        ↓
11. Frontend czyta z widoku offers_enriched (join offers + reviews)
```

## Deduplication hoteli

Problem: "Rixos Premium Tekirova" (R.pl) vs "Rixos Premium Hotel Tekirova" (Exim)

Rozwiązanie:
1. `normalizeHotelName()` → usuwa sufiksy, diakresy, sprowadza do lowercase
2. `Fuse.js` fuzzy search → porównuje z istniejącymi hotelami w tej destynacji
3. Confidence score ≥ 0.85 → automatyczne dopasowanie
4. 0.50-0.85 → dopasowanie + flaga do manualnej weryfikacji
5. < 0.50 → nowy hotel
6. Każda para (provider, hotel_name) → hotel_aliases z confidence_score

## System scoringu

Score 0-100 na podstawie:

| Czynnik | Waga | Opis |
|---------|------|------|
| priceNormalized | 0.20 | Cena względem min/max w zbiorze |
| overallRating | 0.15 | TripAdvisor/Google overall |
| foodScore | 0.25 | Ocena jedzenia |
| roomsScore | 0.18 | Ocena pokoi |
| hotelStars | 0.07 | 4★=0.5, 5★=1.0 |
| reviewCountLog | 0.05 | Log liczby opinii (wiarygodność) |
| priceQualityRatio | 0.10 | quality/price (znormalizowane) |

Wagi konfigurowalne przez `scoring.config.json`.
