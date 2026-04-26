import { z } from 'zod';
import { AirportCodeSchema, BoardTypeSchema, HotelStarsSchema } from './filter.js';

export const OfferSchema = z.object({
  id: z.string().uuid(),
  searchRunId: z.string().uuid(),
  providerId: z.string().uuid(),
  providerCode: z.enum(['rpl', 'exim', 'itaka', 'grecos', 'tui', 'wakacjepl']),
  hotelId: z.string().uuid().optional(),
  providerOfferId: z.string().optional(),
  destinationId: z.string().uuid().optional(),
  departureAirport: AirportCodeSchema,
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.number().int().min(1).max(60),
  hotelName: z.string().min(1),
  hotelStars: HotelStarsSchema,
  hotelLocation: z.string(),
  boardType: BoardTypeSchema,
  roomType: z.string().optional(),
  priceTotal: z.number().positive(),
  pricePerPerson: z.number().positive(),
  currency: z.string().length(3),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  sourceUrl: z.string().url(),
  rawData: z.record(z.unknown()).optional(),
  compositeScore: z.number().min(0).max(100).optional(),
  isAvailable: z.boolean().default(true),
  scrapedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type OfferInput = z.input<typeof OfferSchema>;

/** Raw offer data before normalization — scrapers produce this */
export const RawOfferSchema = z.object({
  providerCode: z.enum(['rpl', 'exim', 'itaka', 'grecos', 'tui', 'wakacjepl']),
  providerOfferId: z.string().optional(),
  hotelName: z.string(),
  hotelStars: z.number().int().min(1).max(5),
  hotelLocation: z.string(),
  destinationRaw: z.string(),   // provider-specific destination string
  departureAirport: z.string(),
  departureDate: z.string(),
  returnDate: z.string().optional(),
  nights: z.number().int(),
  boardType: z.string(),        // will be normalized
  roomType: z.string().optional(),
  priceTotal: z.number(),
  pricePerPerson: z.number().optional(),
  currency: z.string().default('PLN'),
  adults: z.number().int().default(2),
  children: z.number().int().default(0),
  sourceUrl: z.string(),
  imageUrl: z.string().optional(),
  rawData: z.record(z.unknown()).optional(),
});

export type RawOffer = z.infer<typeof RawOfferSchema>;
