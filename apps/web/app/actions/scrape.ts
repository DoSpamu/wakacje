'use server';

export interface TriggerResult {
  ok: boolean;
  message: string;
  workflow?: string;
}

/**
 * Server action — triggers a scrape via GitHub Actions workflow_dispatch.
 * Runs on the server, so GITHUB_TOKEN / GITHUB_REPO are never sent to the browser.
 */
export async function triggerScrape(providers = 'all'): Promise<TriggerResult> {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPO']; // e.g. "dawid/wakacje"

  if (!token || !repo) {
    return {
      ok: false,
      message: 'Scraping nie jest skonfigurowane (brak GITHUB_TOKEN / GITHUB_REPO w środowisku).',
    };
  }

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
    return {
      ok: false,
      message: `GitHub API error ${res.status}: ${detail.slice(0, 200)}`,
    };
  }

  const workflowUrl = `https://github.com/${repo}/actions/workflows/scrape.yml`;
  return {
    ok: true,
    message: 'Scraper uruchomiony! Wyniki pojawią się za kilka minut.',
    workflow: workflowUrl,
  };
}
