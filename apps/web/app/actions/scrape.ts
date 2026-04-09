'use server';

import path from 'path';

export interface TriggerResult {
  ok: boolean;
  message: string;
  workflow?: string;
}

/**
 * Server action — triggers a scrape.
 * - On Vercel (GITHUB_TOKEN set): dispatches GitHub Actions workflow_dispatch.
 * - Locally: spawns tsx child process directly.
 */
export async function triggerScrape(providers = 'all'): Promise<TriggerResult> {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPO'];

  if (token && repo) {
    return triggerGitHub(providers, token, repo);
  }

  return spawnLocal(providers);
}

async function triggerGitHub(providers: string, token: string, repo: string): Promise<TriggerResult> {
  const today = new Date().toISOString().split('T')[0]!;
  const in90 = new Date(Date.now() + 90 * 24 * 3600_000).toISOString().split('T')[0]!;

  const res = await fetch(
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
        ref: 'main',
        inputs: { providers, date_from: today, date_to: in90 },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, message: `GitHub API error ${res.status}: ${detail.slice(0, 200)}` };
  }

  return {
    ok: true,
    message: 'Scraper uruchomiony przez GitHub Actions. Wyniki za ~5 minut.',
    workflow: `https://github.com/${repo}/actions/workflows/scrape.yml`,
  };
}

async function spawnLocal(providers: string): Promise<TriggerResult> {
  try {
    const { spawn } = await import('child_process');

    // Works whether cwd is apps/web or repo root
    const cwd = process.cwd();
    const root = cwd.endsWith('apps/web') || cwd.endsWith('apps\\web')
      ? path.resolve(cwd, '..', '..')
      : cwd;
    const scraperDir = path.join(root, 'packages', 'scrapers');

    const args = ['--import', 'tsx/esm', 'src/run.ts'];
    if (providers !== 'all') args.push(providers);

    const child = spawn('node', args, {
      cwd: scraperDir,
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return {
      ok: true,
      message: `Scraper uruchomiony lokalnie (PID ${child.pid ?? '?'}). Dane pojawią się po zakończeniu.`,
    };
  } catch (err) {
    return { ok: false, message: `Błąd uruchamiania scrapera: ${String(err)}` };
  }
}
