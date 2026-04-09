/**
 * Grecos Holiday scraper configuration.
 *
 * Selectors verified against live grecos.pl DOM (2026-04).
 * Cards use class-based selectors from their legacy CSS.
 */

export const GRECOS_SELECTORS = {
  /** Offer card — the wrapping div; card contains one <a> element */
  offerCard: 'div.MT01b.ofert-teaser',
  /** Hotel name — bold paragraph inside the hotel desc block */
  hotelName: 'div.ofert-teaser__hotel p.f-size12.f-w-bold',
  /**
   * Star rating as text symbols: "***", "****", "***+"
   * Count asterisks; "+" suffix means half-star (round up).
   */
  hotelStars: 'span.ofert-teaser__stars',
  /** Location/region e.g. "Rodos", "Kreta Wschodnia" */
  hotelLocation: 'div.ofert-teaser__place p.f-size12.f-w-bold',
  /**
   * Price text: "Od 1 922 PLN 3 dni"
   * Parse the number before "PLN" as total price.
   * Days count is unreliable — use filter nights or default 7.
   */
  priceTotal: 'div.ofert-teaser__price span.f-size10',
  /** Not displayed in cards — derive from total ÷ adults */
  pricePerPerson: '',
  /** Board type not shown in card list — default from filter (all-inclusive) */
  boardType: '',
  /** Not in cards — extract from URL params (DateOfDeparture) */
  departureDate: '',
  /** Not in cards — extract from URL params (DurationInterval) */
  nights: '',
  /** Not in cards — extract from URL params (From) */
  departureAirport: '',
  /** Card's direct child <a> tag */
  offerLink: 'a',
  loadingSpinner: '.loading, [class*="Loading"], [class*="Spinner"]',
  loadMoreBtn: 'button:has-text("Więcej"), button:has-text("Pokaż więcej"), .more-btn',
  noResults: '.no-results, [class*="NoResults"]',
};

export const GRECOS_CONFIG = {
  resultsTimeout: 30_000,
  maxPages: 15,
  baseUrl: 'https://www.grecos.pl',
  searchPath: '/wakacje',
};

export const GRECOS_STARS_MAP: Record<number, string> = {
  5: '50',
  4: '40,45',
  3: '30,35',
};

export const GRECOS_BOARD_MAP: Record<string, string> = {
  'all-inclusive': '1',
  'ultra-all-inclusive': '1',
  'half-board': '2',
  'full-board': '3',
  'bed-and-breakfast': '4',
  'room-only': '5',
  'unknown': '',
};
