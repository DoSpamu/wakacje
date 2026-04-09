/**
 * TUI Poland scraper configuration.
 *
 * Reference URL:
 * https://www.tui.pl/wypoczynek/wyniki-wyszukiwania-samolot?q=:price:byPlane:T:a:KTW:a:KRK
 *   :dF:6:dT:8:ctAdult:2:ctChild:0:room:2:board:GT06-AI GT06-XX GT06-AIP
 *   :minHotelCategory:4s:...
 *
 * TUI uses a complex query string format with colon-separated key:value pairs.
 * The search is fully client-side rendered.
 */

export const TUI_SELECTORS = {
  resultsContainer: '[class*="SearchResultsList"], [class*="OfferList"], [data-testid="results"]',
  offerCard: '[class*="OfferCard"], [class*="offer-card"], [data-testid="offer-card"]',
  hotelName: '[class*="HotelName"], [class*="hotel-name"], [data-testid="hotel-name"]',
  hotelStars: '[class*="Stars"], [class*="stars"], [data-testid="stars"]',
  hotelLocation: '[class*="Location"], [class*="Destination"], [data-testid="location"]',
  departureDate: '[class*="Date"], [class*="Departure"], [data-testid="date"]',
  nights: '[class*="Duration"], [class*="Nights"], [data-testid="nights"]',
  boardType: '[class*="Board"], [class*="Meal"], [data-testid="board"]',
  priceTotal: '[class*="Price"] strong, [data-testid="price"], [class*="TotalPrice"]',
  pricePerPerson: '[class*="PerPerson"], [data-testid="per-person"]',
  offerLink: 'a[href*="/oferta"], a[href*="tui.pl"], [data-testid="offer-link"]',
  departureAirport: '[class*="Airport"], [data-testid="airport"]',
  loadingSpinner: '[class*="Loading"], [class*="Spinner"], [data-testid="loading"]',
  loadMoreBtn: 'button:has-text("Pokaż więcej"), [data-testid="load-more"], [class*="ShowMore"]',
  noResults: '[class*="NoResults"], [data-testid="no-results"]',
};

export const TUI_CONFIG = {
  resultsTimeout: 40_000,
  maxPages: 15,
  baseUrl: 'https://www.tui.pl',
  searchPath: '/wypoczynek/wyniki-wyszukiwania-samolot',
};

/**
 * TUI board type codes in their query format.
 * GT06-AI = All Inclusive
 * GT06-XX = Ultra All Inclusive
 * GT06-AIP = All Inclusive Plus
 * GT06-HB = Half Board
 * GT06-FB = Full Board
 * GT06-BB = Bed & Breakfast
 * GT06-RO = Room Only
 */
export const TUI_BOARD_CODES: Record<string, string> = {
  'all-inclusive': 'GT06-AI GT06-AIP',
  'ultra-all-inclusive': 'GT06-XX GT06-AI',
  'half-board': 'GT06-HB',
  'full-board': 'GT06-FB',
  'bed-and-breakfast': 'GT06-BB',
  'room-only': 'GT06-RO',
};

/** TUI hotel category: 5s, 4s, 3s */
export const TUI_STARS_MAP: Record<number, string> = {
  5: '5s',
  4: '4s',
  3: '3s',
};
