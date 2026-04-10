import type { NextRequest } from 'next/server';
import { searchItakaLive, type LiveSearchParams } from '@/lib/live-search/itaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseParams(req: NextRequest): LiveSearchParams {
  const s = req.nextUrl.searchParams;

  const destinations = s.get('destinations')?.split(',').filter(Boolean) ?? [
    'turkey', 'egypt', 'greece', 'spain', 'cyprus',
  ];
  const airports = s.get('airports')?.split(',').filter(Boolean) ?? ['KTW', 'KRK'];
  const boardTypes = s.get('boardTypes')?.split(',').filter(Boolean) ?? [
    'all-inclusive',
    'ultra-all-inclusive',
  ];

  // dateFrom defaults to today, dateTo to today+90d
  const today = new Date().toISOString().split('T')[0]!;
  const plus90 = new Date(Date.now() + 90 * 86_400_000).toISOString().split('T')[0]!;

  return {
    destinations,
    airports,
    boardTypes,
    dateFrom: s.get('dateFrom') ?? today,
    dateTo: s.get('dateTo') ?? plus90,
    nightsMin: parseInt(s.get('nightsMin') ?? '5', 10),
    nightsMax: parseInt(s.get('nightsMax') ?? '16', 10),
    adults: parseInt(s.get('adults') ?? '2', 10),
  };
}

export async function GET(request: NextRequest) {
  const params = parseParams(request);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        for await (const { destination, offers, error } of searchItakaLive(params)) {
          send({ type: 'batch', destination, offers, error });
        }
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        send({ type: 'done' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
