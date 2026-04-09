/**
 * R.pl scraper configuration.
 *
 * CSS selectors verified against live r.pl DOM (2026-04).
 * Cards use data-test-id="r-bloczek:szukaj:N" pattern; class-based selectors are stable.
 *
 * To re-verify selectors: SCRAPER_SAVE_SNAPSHOTS=true pnpm scrape:rpl
 * then open packages/scrapers/snapshots/rpl_*.html in browser DevTools.
 */
export const RPL_SELECTORS = {
  /** Individual offer card — the card IS an <a> element */
  offerCard: '.r-bloczek--bloczek-szukaj',

  /** Hotel name */
  hotelName: '.r-bloczek-tytul',

  /**
   * Star rating — has data-rating="4" / "5" attribute.
   * Text content may be empty; use getAttribute('data-rating').
   */
  hotelStars: '.r-gwiazdki',

  /**
   * Location string: "Wypoczynek • Grecja: Zakynthos"
   * Split on ":" to get region, on "•" to get country.
   */
  hotelLocation: '[data-test-id*="lokalizacja"]',

  /**
   * Combined departure date + duration:
   * "04.09.2026 (8 dni / 7 noclegów)"
   * Parse DD.MM.YYYY for date, digits before "noclegów" for nights.
   */
  departureDate: '[data-test-id*="termin-wyjazdu"]',

  /** Same element as departureDate — nights embedded in text */
  nights: '[data-test-id*="termin-wyjazdu"]',

  /** Board type: "All inclusive", "Ultra All Inclusive", etc. */
  boardType: '[data-test-id*="wyzywienie"]',

  /**
   * Price shown is per person ("zł/os.").
   * Multiply by adults count to get total.
   */
  price: '.r-bloczek-cena__aktualna',
  pricePerPerson: '.r-bloczek-cena__aktualna',

  /**
   * Departure airport shown as city name: "Katowice", "Kraków".
   * Map city → IATA code in parser.
   */
  departureAirport: '[data-test-id*="przystanek"]',

  /** Loading / pagination */
  loadingSpinner: '.r-spinner, [class*="Spinner"], [class*="Loading"]',
  loadMoreBtn: 'button:has-text("Więcej ofert"), button:has-text("Załaduj więcej"), [data-test-id="load-more"]',
  noResults: '[class*="NoResults"], [data-test-id="no-results"]',
};

export const RPL_CONFIG = {
  resultsTimeout: 30_000,
  maxPages: 15,
  minOffersPerPage: 1,
};
