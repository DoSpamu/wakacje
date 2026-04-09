import { createServerClient } from '@/lib/supabase';
import type { ScrapeRunRow } from '@/lib/types';
import ScrapeHistory from '@/components/ScrapeHistory';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('scrape_run_summary')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Historia uruchomień</h1>
        <p className="text-sm text-slate-500 mt-1">
          Logi wszystkich uruchomień scrapera
        </p>
      </div>

      <ScrapeHistory runs={(data ?? []) as ScrapeRunRow[]} />
    </div>
  );
}
