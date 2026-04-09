import { createServerClient } from '@/lib/supabase';
import type { ScrapeRunRow } from '@/lib/types';
import ScrapeHistory from '@/components/ScrapeHistory';
import ScrapeButton from '@/components/ScrapeButton';

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historia uruchomień</h1>
          <p className="text-sm text-slate-500 mt-1">
            Logi wszystkich uruchomień scrapera · auto-odświeżanie o 8:30 i 15:00
          </p>
        </div>
        <ScrapeButton />
      </div>

      <ScrapeHistory runs={(data ?? []) as ScrapeRunRow[]} />
    </div>
  );
}
