/**
 * Exim Tours scraper configuration.
 * Update selectors when Exim changes their DOM.
 *
 * Exim Tours uses a SPA (Angular/React based search app).
 * The search results are rendered after an API call.
 */
export const EXIM_SELECTORS = {
  /** Results container */
  resultsContainer: '.search-results, [class*="ResultsList"], [class*="OfferList"], .offers-wrapper',
  /** Individual offer card */
  offerCard: '.offer-item, [class*="OfferCard"], [class*="offer-card"], .result-item',
  /** Hotel name */
  hotelName: '.hotel-name, [class*="HotelName"], h2.name, .offer-title',
  /** Hotel stars */
  hotelStars: '.stars, [class*="Stars"], .rating-stars, [data-testid="stars"]',
  /** Location/destination */
  hotelLocation: '.location, [class*="Location"], .destination, .place',
  /** Departure date */
  departureDate: '.departure-date, [class*="Date"], .date-from',
  /** Number of nights */
  nights: '.nights, [class*="Nights"], .duration',
  /** Board type */
  boardType: '.board-type, [class*="Board"], .meal-type, .feeding',
  /** Price total */
  priceTotal: '.price-total, [class*="PriceTotal"], .total-price, .price strong',
  /** Price per person */
  pricePerPerson: '.price-per-person, [class*="PerPerson"], .person-price',
  /** Offer link */
  offerLink: 'a.offer-link, a[href*="/oferta"], a[href*="/hotel"]',
  /** Departure airport */
  departureAirport: '.airport, [class*="Airport"], .departure-airport',
  /** Loading indicator */
  loadingSpinner: '.loading, [class*="Spinner"], [class*="Loading"], .loader',
  /** Load more / next page */
  loadMoreBtn: 'button:has-text("Więcej"), button:has-text("Pokaż więcej"), .load-more, [class*="LoadMore"]',
  /** Pagination next */
  paginationNext: '.pagination-next, [aria-label="Następna strona"], button:has-text("Następna")',
  /** No results */
  noResults: '.no-results, [class*="NoResults"], [class*="EmptyState"]',
};

export const EXIM_CONFIG = {
  resultsTimeout: 35_000,
  maxPages: 15,
  /** Exim API endpoint pattern — used to intercept XHR responses if available */
  apiPattern: '**/api/**offers**',
};
