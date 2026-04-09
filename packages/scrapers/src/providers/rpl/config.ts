/**
 * R.pl scraper configuration.
 *
 * All CSS selectors are isolated here. When r.pl updates their DOM,
 * only this file needs to change — not the scraper logic.
 *
 * To update selectors:
 * 1. Open https://r.pl/szukaj with DevTools
 * 2. Find the new selector for each element
 * 3. Update the corresponding value below
 * 4. Run: pnpm scrape:rpl --headless=false to verify
 */
export const RPL_SELECTORS = {
  /** Container holding all search results */
  resultsContainer: '[data-testid="results-list"], .offers-list, .results-container, [class*="ResultsList"], [class*="OffersList"]',
  /** Individual offer card */
  offerCard: '[data-testid="offer-card"], .offer-card, [class*="OfferCard"], [class*="offer-item"]',
  /** Hotel name within card */
  hotelName: '[data-testid="hotel-name"], .hotel-name, h2, h3, [class*="HotelName"], [class*="hotel-name"]',
  /** Hotel star rating */
  hotelStars: '[data-testid="hotel-stars"], .hotel-stars, [class*="Stars"], [class*="stars"]',
  /** Hotel location / destination */
  hotelLocation: '[data-testid="hotel-location"], .hotel-location, [class*="Location"], [class*="location"]',
  /** Departure date */
  departureDate: '[data-testid="departure-date"], .departure-date, [class*="DepartureDate"]',
  /** Number of nights */
  nights: '[data-testid="nights"], .nights, [class*="Nights"]',
  /** Board type (all-inclusive etc.) */
  boardType: '[data-testid="board-type"], .board-type, [class*="BoardType"], [class*="meal"]',
  /** Total price */
  price: '[data-testid="price"], .price, [class*="Price"], [class*="price"] .amount',
  /** Price per person */
  pricePerPerson: '[data-testid="price-per-person"], .price-per-person, [class*="PricePerPerson"]',
  /** Link to offer */
  offerLink: 'a[href*="/oferta"], a[href*="/hotel"], a[data-testid="offer-link"]',
  /** Departure airport */
  departureAirport: '[data-testid="departure-airport"], .departure-airport, [class*="Airport"]',
  /** Loading spinner (wait for it to disappear) */
  loadingSpinner: '.loading, [class*="Spinner"], [class*="Loading"], [data-testid="loading"]',
  /** "Load more" / pagination button */
  loadMoreBtn: 'button:has-text("Więcej ofert"), button:has-text("Załaduj więcej"), [data-testid="load-more"], .load-more',
  /** No results message */
  noResults: '[class*="NoResults"], [data-testid="no-results"], :has-text("Brak wyników")',
};

export const RPL_CONFIG = {
  /** Wait timeout for results in ms */
  resultsTimeout: 30_000,
  /** Max pages to scrape per URL */
  maxPages: 15,
  /** Minimum offers per page to continue pagination */
  minOffersPerPage: 1,
};
