export const CORAL_SELECTORS = {
  resultsContainer: '.offers-list, [class*="Results"], [class*="OffersList"]',
  offerCard: '.offer-item, [class*="OfferCard"], [class*="offer-card"]',
  hotelName: '.hotel-name, h2, [class*="HotelName"]',
  hotelStars: '.stars, [class*="Stars"]',
  hotelLocation: '.location, [class*="Location"], .destination',
  departureDate: '.date, [class*="Date"], .departure',
  nights: '.nights, [class*="Nights"], .duration',
  boardType: '.board, [class*="Board"], .meal',
  priceTotal: '.price, [class*="Price"] strong',
  pricePerPerson: '.per-person, [class*="PerPerson"]',
  offerLink: 'a[href*="/oferta"], a[href*="/hotel"]',
  departureAirport: '.airport, [class*="Airport"]',
  loadingSpinner: '.loading, [class*="Spinner"]',
  loadMoreBtn: 'button:has-text("Więcej"), .load-more',
  noResults: '.no-results, [class*="NoResults"]',
};

export const CORAL_CONFIG = {
  resultsTimeout: 35_000,
  maxPages: 15,
  baseSearchUrl: 'https://www.coraltravel.pl/wczasy',
};
