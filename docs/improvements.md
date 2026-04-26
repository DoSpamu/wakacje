# Pomysły na ulepszenia

## Poprawki (priorytet)

- [ ] Coral z subtitle w page.tsx:189
- [ ] priceMin filter w /api/offers + SearchForm
- [ ] EventSource cleanup przy unmount (useEffect return)
- [ ] Inline enrichment limit w orchestrator (max 20 per run)
- [ ] Usunąć dead code getHotelsByDestination z queries.ts
- [ ] N+1 → batch hotel lookup (grupować per unikalny hotel przed findSimilarHotelsByName)

## Nowe funkcje

- [ ] URL-persisted search state (useSearchParams zamiast useState)
- [ ] TUI live search (parseTuiJsonLdItems jest już pure, tylko fetch + endpoint)
- [ ] Historia cen per hotel (chart z is_available=false offers)
- [ ] Filtr pricePerPerson zamiast/obok priceTotal
