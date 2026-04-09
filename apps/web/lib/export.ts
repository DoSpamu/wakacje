/**
 * Export utilities — Excel (XLSX) and CSV generation.
 * Runs server-side via API route.
 */

import ExcelJS from 'exceljs';
import type { OfferRow } from './types.js';

const COLUMNS = [
  { header: 'Hotel', key: 'hotel_name', width: 30 },
  { header: 'Kraj', key: 'destination_display', width: 15 },
  { header: 'Lokalizacja', key: 'hotel_location', width: 20 },
  { header: 'Operator', key: 'provider_name', width: 15 },
  { header: 'Lotnisko', key: 'departure_airport', width: 10 },
  { header: 'Wylot', key: 'departure_date', width: 12 },
  { header: 'Powrót', key: 'return_date', width: 12 },
  { header: 'Noce', key: 'nights', width: 8 },
  { header: 'Gwiazdki', key: 'hotel_stars', width: 10 },
  { header: 'Wyżywienie', key: 'board_type', width: 18 },
  { header: 'Cena całk. (PLN)', key: 'price_total', width: 16 },
  { header: 'Cena/os. (PLN)', key: 'price_per_person', width: 15 },
  { header: 'TripAdvisor', key: 'tripadvisor_rating', width: 12 },
  { header: 'TA Liczba opinii', key: 'tripadvisor_reviews', width: 14 },
  { header: 'TA Jedzenie', key: 'tripadvisor_food_score', width: 12 },
  { header: 'TA Pokoje', key: 'tripadvisor_rooms_score', width: 12 },
  { header: 'Opis jedzenia', key: 'tripadvisor_food_summary', width: 35 },
  { header: 'Opis pokoi', key: 'tripadvisor_rooms_summary', width: 35 },
  { header: 'Tagi', key: 'tripadvisor_tags', width: 40 },
  { header: 'Google rating', key: 'google_rating', width: 12 },
  { header: 'Score', key: 'composite_score', width: 10 },
  { header: 'Link do oferty', key: 'source_url', width: 60 },
];

export async function generateXlsx(offers: OfferRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Wakacje Aggregator';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Oferty', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  sheet.columns = COLUMNS;

  // Header style
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
    };
  });

  // Data rows
  for (const offer of offers) {
    const row = sheet.addRow({
      hotel_name: offer.hotel_name,
      destination_display: offer.destination_display ?? '',
      hotel_location: offer.hotel_location ?? '',
      provider_name: offer.provider_name,
      departure_airport: offer.departure_airport,
      departure_date: offer.departure_date,
      return_date: offer.return_date,
      nights: offer.nights,
      hotel_stars: '★'.repeat(offer.hotel_stars),
      board_type: translateBoardType(offer.board_type),
      price_total: offer.price_total,
      price_per_person: offer.price_per_person,
      tripadvisor_rating: offer.tripadvisor_rating ?? '',
      tripadvisor_reviews: offer.tripadvisor_reviews ?? '',
      tripadvisor_food_score: offer.tripadvisor_food_score ?? '',
      tripadvisor_rooms_score: offer.tripadvisor_rooms_score ?? '',
      tripadvisor_food_summary: offer.tripadvisor_food_summary ?? '',
      tripadvisor_rooms_summary: offer.tripadvisor_rooms_summary ?? '',
      tripadvisor_tags: (offer.tripadvisor_tags ?? []).join(', '),
      google_rating: offer.google_rating ?? '',
      composite_score: offer.composite_score ?? '',
      source_url: offer.source_url,
    });

    // Price formatting
    const priceCellTotal = row.getCell('price_total');
    priceCellTotal.numFmt = '#,##0 "PLN"';

    const priceCellPer = row.getCell('price_per_person');
    priceCellPer.numFmt = '#,##0 "PLN"';

    // Score coloring
    const scoreCell = row.getCell('composite_score');
    const score = offer.composite_score;
    if (score !== null && score !== undefined) {
      const argb =
        score >= 80 ? 'FFBBF7D0' : // green
        score >= 60 ? 'FFD9F99D' : // lime
        score >= 40 ? 'FFFEF08A' : // yellow
        'FFFECACA'; // red
      scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      scoreCell.font = { bold: true };
    }

    // Hyperlink for offer URL
    const linkCell = row.getCell('source_url');
    linkCell.value = {
      text: 'Otwórz ofertę',
      hyperlink: offer.source_url,
    };
    linkCell.font = { color: { argb: 'FF2563EB' }, underline: true };

    // Zebra striping
    if (row.number % 2 === 0) {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb === undefined) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });
    }
  }

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

export function generateCsv(offers: OfferRow[]): string {
  const headers = COLUMNS.map((c) => c.header);
  const rows = offers.map((o) => [
    csvEscape(o.hotel_name),
    csvEscape(o.destination_display ?? ''),
    csvEscape(o.hotel_location ?? ''),
    csvEscape(o.provider_name),
    csvEscape(o.departure_airport),
    csvEscape(o.departure_date),
    csvEscape(o.return_date),
    o.nights,
    o.hotel_stars,
    csvEscape(translateBoardType(o.board_type)),
    o.price_total,
    o.price_per_person,
    o.tripadvisor_rating ?? '',
    o.tripadvisor_reviews ?? '',
    o.tripadvisor_food_score ?? '',
    o.tripadvisor_rooms_score ?? '',
    csvEscape(o.tripadvisor_food_summary ?? ''),
    csvEscape(o.tripadvisor_rooms_summary ?? ''),
    csvEscape((o.tripadvisor_tags ?? []).join('; ')),
    o.google_rating ?? '',
    o.composite_score ?? '',
    csvEscape(o.source_url),
  ]);

  const lines = [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ];

  return '\uFEFF' + lines.join('\r\n'); // BOM for Excel compatibility
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function translateBoardType(raw: string): string {
  const map: Record<string, string> = {
    'all-inclusive': 'All Inclusive',
    'ultra-all-inclusive': 'Ultra All Inclusive',
    'half-board': 'Half Board',
    'full-board': 'Full Board',
    'bed-and-breakfast': 'Śniadanie',
    'room-only': 'Bez wyżywienia',
    'unknown': 'Nieokreślone',
  };
  return map[raw] ?? raw;
}
