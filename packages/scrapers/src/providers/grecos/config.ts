/**
 * Grecos Holiday scraper configuration.
 *
 * Reference URL:
 * https://www.grecos.pl/wakacje?From=KTW,KRK&Adults=2&Children=0
 *   &DurationInterval=6:9&DateOfDeparture=20260409&DateOfReturn=20260530
 *   &PriceFrom=0&PriceTo=50000&PriceType=man&ObjectType=H,R,AP
 *   &HotelStandard=50,45,40&BoardStandards=1
 *
 * Grecos is primarily a Greek islands specialist but covers other Mediterranean destinations.
 */

export const GRECOS_SELECTORS = {
  resultsContainer: '.offers, [class*="Offers"], [class*="Results"], .package-list',
  offerCard: '.offer, [class*="Offer"], .package, .hotel-card',
  hotelName: '.hotel-name, h2, h3, [class*="HotelName"]',
  hotelStars: '.stars, [class*="Stars"], .rating',
  hotelLocation: '.location, .resort, [class*="Location"]',
  departureDate: '.departure, .date, [class*="Date"]',
  nights: '.duration, .nights, [class*="Nights"]',
  boardType: '.board, .meal, [class*="Board"]',
  priceTotal: '.price, [class*="Price"] strong, .total',
  pricePerPerson: '.per-person, [class*="PerPerson"]',
  offerLink: 'a[href*="/oferta"], a[href*="/hotel"], a.offer-link',
  departureAirport: '.airport, [class*="Airport"]',
  loadingSpinner: '.loading, [class*="Loading"], [class*="Spinner"]',
  loadMoreBtn: 'button:has-text("Więcej"), .load-more, [class*="LoadMore"]',
  noResults: '.no-results, [class*="NoResults"]',
};

export const GRECOS_CONFIG = {
  resultsTimeout: 30_000,
  maxPages: 15,
  baseUrl: 'https://www.grecos.pl',
  searchPath: '/wakacje',
};

/**
 * Grecos HotelStandard values:
 * 50 = 5★, 45 = 4.5★, 40 = 4★, 35 = 3.5★, 30 = 3★
 */
export const GRECOS_STARS_MAP: Record<number, string> = {
  5: '50',
  4: '40,45',
  3: '30,35',
};

/**
 * Grecos BoardStandards:
 * 1 = All Inclusive, 2 = Half Board, 3 = Full Board, 4 = B&B
 */
export const GRECOS_BOARD_MAP: Record<string, string> = {
  'all-inclusive': '1',
  'ultra-all-inclusive': '1',
  'half-board': '2',
  'full-board': '3',
  'bed-and-breakfast': '4',
  'room-only': '5',
  'unknown': '',
};
