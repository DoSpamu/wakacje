import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/scrape
 *
 * Triggers a scrape run. Requires SCRAPE_API_SECRET header for authorization.
 *
 * On Vercel: dispatches a GitHub Actions workflow_dispatch event.
 * Locally: spawns a child process with tsx.
 *
 * Required env vars on Vercel:
 *   SCRAPE_API_SECRET  — shared secret for auth
 *   GITHUB_TOKEN       — PAT with repo+workflow scopes
 *   GITHUB_REPO        — "owner/repo" e.g. "dawid/wakacje"
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

  const isVercel = process.env['VERCEL'] === '1';

  if (isVercel) {
    return triggerGitHubActions(body);
  }

  return spawnLocalScraper(body);
}

/** Trigger GitHub Actions workflow_dispatch (for Vercel production) */
async function triggerGitHubActions(body: {
  providers?: string[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPO']; // e.g. "dawid/wakacje"

  if (!token || !repo) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN and GITHUB_REPO env vars are required on Vercel' },
      { status: 500 },
    );
  }

  const providers = body.providers?.join(',') ?? 'all';
  const today = new Date().toISOString().split('T')[0]!;
  const in90 = new Date(Date.now() + 90 * 24 * 3600_000).toISOString().split('T')[0]!;

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/scrape.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'master',
        inputs: {
          providers,
          date_from: body.dateFrom ?? today,
          date_to: body.dateTo ?? in90,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: 'GitHub API error', detail },
      { status: response.status },
    );
  }

  return NextResponse.json({
    message: 'Scrape triggered via GitHub Actions',
    providers,
    workflow: `https://github.com/${repo}/actions/workflows/scrape.yml`,
  });
}

/** Spawn local scraper process (for development) */
async function spawnLocalScraper(body: {
  providers?: string[];
  destinations?: string[];
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const { spawn } = await import('child_process');

    const providers = body.providers?.join(',') ?? 'all';
    const scraperDir = process.cwd()
      .replace('apps/web', 'packages/scrapers')
      .replace('apps\\web', 'packages\\scrapers');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SCRAPE_DESTINATIONS: body.destinations?.join(',') ?? '',
      SCRAPE_DATE_FROM: body.dateFrom ?? '',
      SCRAPE_DATE_TO: body.dateTo ?? '',
    };

    const args = ['--import', 'tsx/esm', 'src/run.ts'];
    if (providers !== 'all') args.push(providers);

    const child = spawn('node', args, {
      cwd: scraperDir,
      env,
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return NextResponse.json({
      message: 'Scrape started locally',
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
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const { data } = await supabase
    .from('scrape_run_summary')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ runs: data ?? [] });
}
