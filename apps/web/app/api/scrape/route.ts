import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/scrape
 *
 * Triggers a scrape run. Requires SCRAPE_API_SECRET header for authorization.
 *
 * In production the scraper runs on a separate server/process.
 * This endpoint is a convenience trigger — it spawns a child process.
 *
 * For Vercel deployment: use a separate server (Railway, DigitalOcean, etc.)
 * and call this endpoint via a cron job or GitHub Action.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-scrape-secret');

  if (!process.env['SCRAPE_API_SECRET'] || secret !== process.env['SCRAPE_API_SECRET']) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    providers?: string[];
    destinations?: string[];
    dateFrom?: string;
    dateTo?: string;
  };

  // In production: this would POST to a separate scraper API or trigger a job
  // For local development: we can spawn a child process

  const isVercel = process.env['VERCEL'] === '1';

  if (isVercel) {
    // On Vercel, return instructions since we can't spawn long-running processes
    return NextResponse.json({
      message: 'On Vercel, run the scraper separately. See docs/deployment.md',
      command: `pnpm scrape ${(body.providers ?? []).join(',')}`,
      docs: 'docs/deployment.md',
    });
  }

  // Local: try to spawn the scraper as a background process
  try {
    const { spawn } = await import('child_process');

    const providers = body.providers?.join(',') ?? 'all';
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SCRAPE_DESTINATIONS: body.destinations?.join(',') ?? '',
      SCRAPE_DATE_FROM: body.dateFrom ?? '',
      SCRAPE_DATE_TO: body.dateTo ?? '',
    };

    const child = spawn('node', ['--loader', 'ts-node/esm', 'src/run.ts', providers], {
      cwd: process.cwd().replace('apps/web', 'packages/scrapers').replace('apps\\web', 'packages\\scrapers'),
      env,
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return NextResponse.json({
      message: 'Scrape started',
      providers,
      pid: child.pid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to start scraper', detail: String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Return last scrape runs status
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const { data } = await supabase
    .from('scrape_run_summary')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ runs: data ?? [] });
}
