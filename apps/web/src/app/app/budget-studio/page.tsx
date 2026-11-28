import { redirect } from 'next/navigation';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, money } from '@/lib/format';
import { Badge, PageHeader, TableCard } from '@/components/ui';
import { Studio } from '@/components/app/Studio';

export const metadata = { title: 'Budget Planning Studio' };

export default async function BudgetStudio() {
  const { org } = await requireOrg();
  if (!can.readFinance(org.role)) redirect('/app');
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.from('budget_scenarios').select('id, name, strategy, total_funding, currency, created_at, result').eq('org_id', org.org_id).order('created_at', { ascending: false }).limit(20);
  const rows = (data ?? []) as { id: string; name: string; strategy: string; total_funding: number; currency: string; created_at: string; result: { allocated: number; totals: { projects: number; road_km: number } } }[];
  return (
    <>
      <PageHeader title={p.studio.title} subtitle={p.studio.subtitle} />
      <Studio org={org.org_id} currency={org.default_currency} locale={locale} errors={t.errors} labels={{ ...p.studio, km: t.common.km, review: p.studio.subtitle }} />
      {rows.length ? (
        <div className="mt-6"><TableCard title={p.studio.saved}>
          <table className="table"><tbody>{rows.map((s) => <tr key={s.id}><td className="font-[560]">{s.name}</td><td><Badge tone="blue">{p.studio.strategies[s.strategy as keyof typeof p.studio.strategies]}</Badge></td>
            <td className="num">{money(s.total_funding, s.currency, locale)}</td><td className="num">{money(s.result.allocated, s.currency, locale)}</td><td className="num">{s.result.totals.projects} · {s.result.totals.road_km} km</td><td className="text-xs text-ink-2">{date(s.created_at, locale)}</td></tr>)}</tbody></table>
        </TableCard></div>
      ) : null}
    </>
  );
}
