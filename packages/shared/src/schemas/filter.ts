import { z } from 'zod';

export const AirportCodeSchema = z.enum(['KTW', 'KRK', 'WAW', 'GDN', 'POZ', 'WRO', 'RZE']);

export const CanonicalDestinationSchema = z.enum([
  'turkey',
  'egypt',
  'greece',
  'spain',
  'cyprus',
  'tunisia',
  'bulgaria',
  'croatia',
  'malta',
  'canary-islands',
  'portugal',
  'morocco',
  'albania',
  'montenegro',
]);

export const BoardTypeSchema = z.enum([
  'all-inclusive',
  'ultra-all-inclusive',
  'half-board',
  'full-board',
  'bed-and-breakfast',
  'room-only',
  'unknown',
]);

export const HotelStarsSchema = z.union([z.literal(3), z.literal(4), z.literal(5)]);

export const NightsRangeSchema = z.object({
  min: z.number().int().min(1).max(30),
  max: z.number().int().min(1).max(30),
});

export const SearchFilterSchema = z.object({
  destinations: z.array(CanonicalDestinationSchema).min(1),
  departureAirports: z.array(AirportCodeSchema).min(1),
  departureDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: NightsRangeSchema,
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(6).default(0),
  hotelStars: z.array(HotelStarsSchema).min(1),
  boardTypes: z.array(BoardTypeSchema).min(1),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  currency: z.string().length(3).default('PLN'),
  sortBy: z
    .enum(['price', 'compositeScore', 'hotelStars', 'foodScore', 'overallRating', 'departureDate', 'nights'])
    .default('compositeScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  providers: z.array(z.enum(['rpl', 'exim', 'coral', 'itaka', 'grecos', 'tui'])).optional(),
});

export type SearchFilterInput = z.input<typeof SearchFilterSchema>;
export type SearchFilterParsed = z.output<typeof SearchFilterSchema>;
