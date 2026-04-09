/**
 * Itaka scraper configuration.
 *
 * Reference URL:
 * https://www.itaka.pl/all-inclusive/tanie/?dateFrom=9.04.2026&dateTo=31.05.2026
 *   &departuresByPlane=KTW%2CKRK&page=1&durationMin=7&participants[0][adults]=2
 *
 * Itaka uses Next.js / React SPA with server-side rendering.
 * Offers are available in __NEXT_DATA__ JSON blob.
 */

export const ITAKA_SELECTORS = {
  resultsContainer: '[class*="SearchResults"], [class*="OfferList"], .offer-list, [data-cy="results"]',
  offerCard: '[class*="OfferCard"], [class*="offer-card"], [data-cy="offer-item"], .offer-item',
  hotelName: '[class*="HotelName"], [class*="hotel-name"], [data-cy="hotel-name"], h2',
  hotelStars: '[class*="Stars"], [class*="stars"], [data-cy="stars"]',
  hotelLocation: '[class*="Location"], [class*="location"], [data-cy="location"]',
  departureDate: '[class*="Date"], [class*="date"], [data-cy="departure-date"]',
  nights: '[class*="Nights"], [class*="nights"], [data-cy="nights"]',
  boardType: '[class*="Board"], [class*="board"], [data-cy="board"]',
  priceTotal: '[class*="Price"] strong, [class*="price"] strong, [data-cy="price"]',
  pricePerPerson: '[class*="PerPerson"], [class*="per-person"], [data-cy="per-person"]',
  offerLink: 'a[href*="/oferta"], a[href*="itaka.pl"]',
  departureAirport: '[class*="Airport"], [class*="airport"], [data-cy="airport"]',
  loadingSpinner: '[class*="Loader"], [class*="Spinner"], [data-cy="loading"]',
  loadMoreBtn: 'button:has-text("Więcej"), [data-cy="load-more"], [class*="LoadMore"]',
  noResults: '[class*="NoResults"], [data-cy="no-results"]',
};

export const ITAKA_CONFIG = {
  resultsTimeout: 30_000,
  maxPages: 20,
  /** URL parameter pattern */
  baseSearchUrl: 'https://www.itaka.pl/wczasy',
  allInclusiveUrl: 'https://www.itaka.pl/all-inclusive/tanie/',
};

/** Itaka URL parameter mapping */
export const ITAKA_BOARD_MAP: Record<string, string> = {
  'all-inclusive': 'ai',
  'ultra-all-inclusive': 'uai',
  'half-board': 'hb',
  'full-board': 'fb',
  'bed-and-breakfast': 'bb',
  'room-only': 'ro',
};

/** Itaka star rating encoding */
export const ITAKA_STARS_MAP: Record<number, string> = {
  3: '30',
  4: '40',
  5: '50',
};

/** Itaka destination mapping (slug-based) */
export const ITAKA_DESTINATIONS: Record<string, string> = {
  turkey: 'turcja',
  egypt: 'egipt',
  greece: 'grecja',
  spain: 'hiszpania',
  cyprus: 'cypr',
  tunisia: 'tunezja',
  bulgaria: 'bulgaria',
  croatia: 'chorwacja',
  malta: 'malta',
  'canary-islands': 'wyspy-kanaryjskie',
  portugal: 'portugalia',
  morocco: 'maroko',
  albania: 'albania',
  montenegro: 'czarnogora',
};
