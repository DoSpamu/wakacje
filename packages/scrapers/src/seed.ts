#!/usr/bin/env node
/**
 * Seed script — inserts mock data for development/testing.
 * Run: pnpm seed
 *
 * Seeds:
 * - providers
 * - destinations
 * - hotels
 * - hotel_reviews_summary
 * - offers (sample)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
);

const PROVIDERS = [
  { code: 'rpl', name: 'R.pl', base_url: 'https://r.pl', is_active: true },
  { code: 'exim', name: 'Exim Tours', base_url: 'https://www.exim.pl', is_active: true },
  { code: 'itaka', name: 'Itaka', base_url: 'https://www.itaka.pl', is_active: true },
  { code: 'grecos', name: 'Grecos Holiday', base_url: 'https://www.grecos.pl', is_active: true },
  { code: 'tui', name: 'TUI Poland', base_url: 'https://www.tui.pl', is_active: true },
  { code: 'wakacjepl', name: 'Wakacje.pl', base_url: 'https://www.wakacje.pl', is_active: true },
];

const DESTINATIONS = [
  { canonical_name: 'turkey', display_name: 'Turcja', country_code: 'TR' },
  { canonical_name: 'egypt', display_name: 'Egipt', country_code: 'EG' },
  { canonical_name: 'greece', display_name: 'Grecja', country_code: 'GR' },
  { canonical_name: 'spain', display_name: 'Hiszpania', country_code: 'ES' },
  { canonical_name: 'cyprus', display_name: 'Cypr', country_code: 'CY' },
  { canonical_name: 'tunisia', display_name: 'Tunezja', country_code: 'TN' },
  { canonical_name: 'bulgaria', display_name: 'Bułgaria', country_code: 'BG' },
  { canonical_name: 'croatia', display_name: 'Chorwacja', country_code: 'HR' },
  { canonical_name: 'malta', display_name: 'Malta', country_code: 'MT' },
  { canonical_name: 'canary-islands', display_name: 'Wyspy Kanaryjskie', country_code: 'ES' },
  { canonical_name: 'portugal', display_name: 'Portugalia', country_code: 'PT' },
  { canonical_name: 'morocco', display_name: 'Maroko', country_code: 'MA' },
  { canonical_name: 'albania', display_name: 'Albania', country_code: 'AL' },
  { canonical_name: 'montenegro', display_name: 'Czarnogóra', country_code: 'ME' },
];

const MOCK_HOTELS = [
  { canonical_name: 'Rixos Premium Tekirova', normalized_name: 'rixos premium tekirova', destination: 'turkey', stars: 5, location_city: 'Tekirova', location_region: 'Antalya' },
  { canonical_name: 'Maxx Royal Kemer Resort', normalized_name: 'maxx royal kemer', destination: 'turkey', stars: 5, location_city: 'Kemer', location_region: 'Antalya' },
  { canonical_name: 'Delphin Imperial', normalized_name: 'delphin imperial', destination: 'turkey', stars: 5, location_city: 'Antalya', location_region: 'Antalya' },
  { canonical_name: 'IC Hotels Green Palace', normalized_name: 'ic hotels green palace', destination: 'turkey', stars: 5, location_city: 'Belek', location_region: 'Antalya' },
  { canonical_name: 'Titanic Mardan Palace', normalized_name: 'titanic mardan palace', destination: 'turkey', stars: 5, location_city: 'Antalya', location_region: 'Antalya' },
  { canonical_name: 'RIXOS Premium Seagate', normalized_name: 'rixos premium seagate', destination: 'egypt', stars: 5, location_city: 'Sharm el-Sheikh', location_region: 'South Sinai' },
  { canonical_name: 'Steigenberger Aqua Magic', normalized_name: 'steigenberger aqua magic', destination: 'egypt', stars: 5, location_city: 'Hurghada', location_region: 'Red Sea' },
  { canonical_name: 'Sheraton Soma Bay Resort', normalized_name: 'sheraton soma bay', destination: 'egypt', stars: 5, location_city: 'Hurghada', location_region: 'Red Sea' },
  { canonical_name: 'Creta Maris Beach Resort', normalized_name: 'creta maris beach', destination: 'greece', stars: 5, location_city: 'Hersonissos', location_region: 'Kreta' },
  { canonical_name: 'Caramel Grecotel Boutique Resort', normalized_name: 'caramel grecotel', destination: 'greece', stars: 5, location_city: 'Rethymno', location_region: 'Kreta' },
  { canonical_name: 'Grecotel Olympia Riviera', normalized_name: 'grecotel olympia riviera', destination: 'greece', stars: 5, location_city: 'Zacharo', location_region: 'Peloponez' },
  { canonical_name: 'Amathus Beach Hotel', normalized_name: 'amathus beach hotel', destination: 'cyprus', stars: 5, location_city: 'Limassol', location_region: 'Limassol' },
  { canonical_name: 'Cap Bon Kelibia Beach', normalized_name: 'cap bon kelibia', destination: 'tunisia', stars: 4, location_city: 'Kelibia', location_region: 'Nabeul' },
  { canonical_name: 'Riu Palace Tenerife', normalized_name: 'riu palace tenerife', destination: 'canary-islands', stars: 5, location_city: 'Adeje', location_region: 'Tenerife' },
];

const MOCK_REVIEWS = [
  { hotel: 'Rixos Premium Tekirova', source: 'tripadvisor', overall: 4.7, reviews: 4823, food: 4.8, rooms: 4.7, cleanliness: 4.9, service: 4.7, tags: ['jedzenie: wyśmienite', 'pokoje: świetne', 'obsługa: wyśmienita', 'ogólnie: wybitny', 'family-friendly'], food_summary: 'Wybitne jedzenie — ogromny wybór, świeże produkty', rooms_summary: 'Luksusowe pokoje z widokiem na morze' },
  { hotel: 'Maxx Royal Kemer Resort', source: 'tripadvisor', overall: 4.8, reviews: 3201, food: 4.9, rooms: 4.8, cleanliness: 5.0, service: 4.9, tags: ['jedzenie: wyśmienite', 'pokoje: świetne', 'czystość: wzorowa', 'ogólnie: wybitny', 'luxury'], food_summary: 'Wyjątkowe jedzenie — kuchnia europejska i turecka na najwyższym poziomie', rooms_summary: 'Wyjątkowo przestronne pokoje, idealne wykończenie' },
  { hotel: 'Delphin Imperial', source: 'tripadvisor', overall: 4.5, reviews: 6234, food: 4.5, rooms: 4.4, cleanliness: 4.6, service: 4.5, tags: ['jedzenie: bardzo dobre', 'pokoje: dobre', 'ogólnie: bardzo dobry', 'animacje wspomniane'], food_summary: 'Bardzo dobre jedzenie — różnorodna oferta restauracyjna', rooms_summary: 'Dobre pokoje, niektóre wymagają odświeżenia' },
  { hotel: 'RIXOS Premium Seagate', source: 'tripadvisor', overall: 4.6, reviews: 5102, food: 4.7, rooms: 4.6, cleanliness: 4.8, service: 4.6, tags: ['jedzenie: wyśmienite', 'czystość: wzorowa', 'ogólnie: bardzo dobry', 'plaża wspomniana'], food_summary: 'Doskonałe jedzenie — szeroki wybór tematycznych restauracji', rooms_summary: 'Przestronne pokoje z dobrymi udogodnieniami' },
  { hotel: 'Steigenberger Aqua Magic', source: 'tripadvisor', overall: 4.3, reviews: 7834, food: 4.2, rooms: 4.2, cleanliness: 4.4, service: 4.1, tags: ['jedzenie: dobre', 'pokoje: dobre', 'ogólnie: dobry', 'wodny park'], food_summary: 'Dobre jedzenie — standardowy bufet all-inclusive', rooms_summary: 'Standardowe pokoje, czyste i funkcjonalne' },
  { hotel: 'Creta Maris Beach Resort', source: 'tripadvisor', overall: 4.5, reviews: 2987, food: 4.6, rooms: 4.4, cleanliness: 4.7, service: 4.5, tags: ['jedzenie: bardzo dobre', 'plaża wspomniana', 'ogólnie: bardzo dobry', 'przyjazny rodzinom'], food_summary: 'Bardzo dobre jedzenie — lokalne kreteńskie specjały', rooms_summary: 'Klimatyczne pokoje w greckim stylu' },
  { hotel: 'Riu Palace Tenerife', source: 'tripadvisor', overall: 4.6, reviews: 4521, food: 4.6, rooms: 4.5, cleanliness: 4.8, service: 4.7, tags: ['jedzenie: bardzo dobre', 'pokoje: dobre', 'ogólnie: bardzo dobry', 'luxury'], food_summary: 'Doskonałe jedzenie — eleganckie restauracje a la carte', rooms_summary: 'Luksusowe pokoje z panoramicznym widokiem' },
];

async function seed() {
  console.info('🌱 Starting seed...');

  // Providers
  const { error: provErr } = await supabase.from('providers').upsert(PROVIDERS, { onConflict: 'code' });
  if (provErr) console.error('Providers error:', provErr.message);
  else console.info('✓ Providers seeded');

  // Destinations
  const { error: destErr } = await supabase.from('destinations').upsert(DESTINATIONS, { onConflict: 'canonical_name' });
  if (destErr) console.error('Destinations error:', destErr.message);
  else console.info('✓ Destinations seeded');

  // Get destination IDs
  const { data: destData } = await supabase.from('destinations').select('id, canonical_name');
  const destMap = Object.fromEntries((destData ?? []).map((d) => [d.canonical_name, d.id]));

  // Hotels
  const hotelInserts = MOCK_HOTELS.map((h) => ({
    canonical_name: h.canonical_name,
    normalized_name: h.normalized_name,
    destination_id: destMap[h.destination] ?? null,
    stars: h.stars,
    location_city: h.location_city,
    location_region: h.location_region,
  }));

  const { error: hotelErr } = await supabase.from('hotels').upsert(hotelInserts, { onConflict: 'normalized_name' });
  if (hotelErr) console.error('Hotels error:', hotelErr.message);
  else console.info('✓ Hotels seeded');

  // Get hotel IDs
  const { data: hotelData } = await supabase.from('hotels').select('id, canonical_name');
  const hotelMap = Object.fromEntries((hotelData ?? []).map((h) => [h.canonical_name, h.id]));

  // Reviews
  const reviewInserts = MOCK_REVIEWS.map((r) => ({
    hotel_id: hotelMap[r.hotel] ?? null,
    source: r.source,
    overall_rating: r.overall,
    review_count: r.reviews,
    food_score: r.food,
    food_summary: r.food_summary,
    rooms_score: r.rooms,
    rooms_summary: r.rooms_summary,
    cleanliness_score: r.cleanliness,
    service_score: r.service,
    beach_score: null,
    sentiment_tags: r.tags,
    scraped_at: new Date().toISOString(),
  })).filter((r) => r.hotel_id !== null);

  const { error: revErr } = await supabase.from('hotel_reviews_summary').upsert(reviewInserts, { onConflict: 'hotel_id,source' });
  if (revErr) console.error('Reviews error:', revErr.message);
  else console.info('✓ Reviews seeded');

  // Sample offers
  const { data: provData } = await supabase.from('providers').select('id, code');
  const provMap = Object.fromEntries((provData ?? []).map((p) => [p.code, p.id]));

  const { data: runData } = await supabase.from('search_runs').insert({
    provider_id: provMap['rpl'] ?? null,
    search_params: { note: 'Seed data' },
    status: 'completed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    offers_found: 20,
  }).select('id').single();

  const searchRunId = runData?.id;
  if (!searchRunId) { console.error('Could not create seed search run'); process.exit(1); }

  const SAMPLE_OFFERS = [
    { hotel: 'Rixos Premium Tekirova', airport: 'KTW', depDate: '2026-06-15', nights: 7, price: 8990, pricePerPerson: 4495, provider: 'rpl', dest: 'turkey', url: 'https://r.pl/oferta/rixos-premium-tekirova' },
    { hotel: 'Rixos Premium Tekirova', airport: 'KRK', depDate: '2026-06-22', nights: 7, price: 9200, pricePerPerson: 4600, provider: 'exim', dest: 'turkey', url: 'https://www.exim.pl/oferta/rixos-premium-tekirova' },
    { hotel: 'Maxx Royal Kemer Resort', airport: 'KTW', depDate: '2026-07-01', nights: 7, price: 12500, pricePerPerson: 6250, provider: 'rpl', dest: 'turkey', url: 'https://r.pl/oferta/maxx-royal-kemer' },
    { hotel: 'Delphin Imperial', airport: 'KTW', depDate: '2026-05-25', nights: 10, price: 7400, pricePerPerson: 3700, provider: 'itaka', dest: 'turkey', url: 'https://www.itaka.pl/oferta/delphin-imperial' },
    { hotel: 'Delphin Imperial', airport: 'KRK', depDate: '2026-05-25', nights: 10, price: 7600, pricePerPerson: 3800, provider: 'tui', dest: 'turkey', url: 'https://www.tui.pl/oferta/delphin-imperial' },
    { hotel: 'RIXOS Premium Seagate', airport: 'KTW', depDate: '2026-05-20', nights: 7, price: 9800, pricePerPerson: 4900, provider: 'rpl', dest: 'egypt', url: 'https://r.pl/oferta/rixos-premium-seagate' },
    { hotel: 'Steigenberger Aqua Magic', airport: 'KTW', depDate: '2026-06-10', nights: 7, price: 5600, pricePerPerson: 2800, provider: 'exim', dest: 'egypt', url: 'https://www.exim.pl/oferta/steigenberger' },
    { hotel: 'Creta Maris Beach Resort', airport: 'KTW', depDate: '2026-06-01', nights: 7, price: 6200, pricePerPerson: 3100, provider: 'grecos', dest: 'greece', url: 'https://www.grecos.pl/oferta/creta-maris' },
    { hotel: 'Riu Palace Tenerife', airport: 'KTW', depDate: '2026-05-15', nights: 10, price: 7800, pricePerPerson: 3900, provider: 'itaka', dest: 'canary-islands', url: 'https://www.itaka.pl/oferta/riu-palace-tenerife' },
  ];

  const offerInserts = SAMPLE_OFFERS.map((o) => {
    const depDate = new Date(o.depDate);
    const retDate = new Date(depDate);
    retDate.setDate(retDate.getDate() + o.nights);

    return {
      search_run_id: searchRunId,
      provider_id: provMap[o.provider] ?? null,
      hotel_id: hotelMap[o.hotel] ?? null,
      destination_id: destMap[o.dest] ?? null,
      departure_airport: o.airport,
      departure_date: o.depDate,
      return_date: retDate.toISOString().split('T')[0],
      nights: o.nights,
      hotel_name: o.hotel,
      hotel_stars: MOCK_HOTELS.find((h) => h.canonical_name === o.hotel)?.stars ?? 4,
      hotel_location: MOCK_HOTELS.find((h) => h.canonical_name === o.hotel)?.location_city ?? '',
      board_type: 'all-inclusive',
      price_total: o.price,
      price_per_person: o.pricePerPerson,
      currency: 'PLN',
      adults: 2,
      children: 0,
      source_url: o.url,
      is_available: true,
      scraped_at: new Date().toISOString(),
      composite_score: Math.floor(60 + Math.random() * 35),
    };
  });

  const { error: offerErr } = await supabase.from('offers').insert(offerInserts);
  if (offerErr) console.error('Offers error:', offerErr.message);
  else console.info('✓ Sample offers seeded');

  console.info('\n✅ Seed complete! You can now start the web app and see data.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
