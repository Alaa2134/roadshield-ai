import Link from 'next/link';
import { Sparkles, Database, Cpu } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { money, num } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, TableCard, projectTone } from '@/components/ui';

export const metadata = { title: 'Cost Predictions' };

export default async function Predictions() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.rpc('project_list', { p_org: org.org_id });
  const all = (data ?? []) as { id: string; code: string; name: string; status: string; currency: string; verified_actual: number | null }[];
  const { data: areas } = await sb.from('maintenance_projects').select('id, verified_damaged_area_m2, repair_method').eq('org_id', org.org_id);
  const am = new Map(((areas ?? []) as { id: string; verified_damaged_area_m2: number | null; repair_method: string | null }[]).map((x) => [x.id, x]));
  const eligible = all.filter((x) => ['completed', 'closed'].includes(x.status) && (am.get(x.id)?.verified_damaged_area_m2 ?? 0) > 0 && (x.verified_actual ?? 0) > 0);
  const open = all.filter((x) => ['planning', 'approved', 'in_progress'].includes(x.status));
  const { data: costModels } = await sb.from('ml_models').select('name, version, status, metrics').eq('kind', 'cost_model');
  return (
    <>
      <PageHeader title={p.predictions.title} subtitle={p.predictions.subtitle} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label={p.predictions.eligible} value={num(eligible.length, locale)} hint={p.predictions.eligibleBody} icon={Database} />
        <Kpi label={t.overview.activeProjects} value={num(open.length, locale)} icon={Sparkles} tone="violet" />
        <Kpi label={p.predictions.ml} value={num((costModels ?? []).length, locale)} hint={(costModels ?? []).length ? undefined : t.empty.models} icon={Cpu} tone="teal" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <TableCard title={t.overview.activeProjects}>
          {open.length ? (
            <table className="table"><thead><tr><th>{t.common.code}</th><th>{t.common.name}</th><th>{t.common.status}</th><th>{p.projects.repairMethod}</th><th className="num">{p.projects.area}</th><th /></tr></thead>
              <tbody>{open.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.code}</td><td className="max-w-56 truncate">{x.name}</td><td><Badge tone={projectTone(x.status)} dot>{t.projectStatus[x.status as keyof typeof t.projectStatus]}</Badge></td>
                <td className="text-xs text-ink-2">{am.get(x.id)?.repair_method ?? '—'}</td><td className="num">{am.get(x.id)?.verified_damaged_area_m2 ? `${num(am.get(x.id)!.verified_damaged_area_m2, locale, 1)} m²` : <span className="text-ink-3">{t.common.notRecorded}</span>}</td>
                <td><Link href={`/app/projects/${x.id}?tab=prediction`} className="btn btn-sm btn-secondary">{p.projects.prediction}</Link></td></tr>)}</tbody></table>
          ) : <EmptyState compact icon={Sparkles} title={t.empty.projects} />}
        </TableCard>
        <div className="grid content-start gap-5">
          <Card><CardHeader title={p.predictions.method} icon={Sparkles} /><p className="text-sm leading-relaxed text-ink-2">{p.predictions.methodBody}</p></Card>
          <Card><CardHeader title={p.predictions.ml} icon={Cpu} /><p className="text-sm leading-relaxed text-ink-2">{p.predictions.mlBody}</p>
            <Link href="/app/model-center" className="mt-3 inline-flex text-[13px] font-[560] text-accent-text">{t.nav.modelCenter}</Link></Card>
          <TableCard title={p.predictions.eligible}>
            {eligible.length ? <table className="table"><tbody>{eligible.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.code}</td><td className="num">{money(x.verified_actual, x.currency, locale)}</td></tr>)}</tbody></table>
              : <p className="px-5 py-4 text-sm text-ink-2">{t.common.none}</p>}
          </TableCard>
        </div>
      </div>
    </>
  );
}
