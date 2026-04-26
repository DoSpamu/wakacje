import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Vercel Cron authenticates with Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return NextResponse.json({ error: 'GITHUB_PAT or GITHUB_REPO not configured' }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/enrich.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'master', inputs: { limit: '100' } }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[cron/enrich] GitHub dispatch failed:', res.status, text);
    return NextResponse.json({ error: 'GitHub dispatch failed', status: res.status }, { status: 502 });
  }

  return NextResponse.json({ ok: true, triggered: new Date().toISOString() });
}
