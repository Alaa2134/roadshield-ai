import { TriangleAlert } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, ButtonLink, EmptyState, PageHeader, TableCard, severityTone } from '@/components/ui';

export const metadata = { title: 'Damage Reports' };

export default async function Reports() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data: o } = await sb.from('organizations').select('service_area').eq('id', org.org_id).maybeSingle();
  const hasArea = !!(o as { service_area: unknown } | null)?.service_area;
  const { data } = hasArea ? await sb.rpc('org_citizen_reports', { p_org: org.org_id, p_limit: 200 }) : { data: [] };
  const rows = (data ?? []) as { id: string; public_code: string; category: string; severity: string; status: string; created_at: string; confirmations_count: number; address: string | null }[];
  return (
    <>
      <PageHeader title={p.reports.title} subtitle={p.reports.subtitle} />
      <TableCard>
        {!hasArea ? <EmptyState icon={TriangleAlert} title={p.reports.noArea} action={org.role === 'owner' ? <ButtonLink href="/app/organization" variant="secondary">{t.nav.organization}</ButtonLink> : undefined} />
          : rows.length ? (
            <table className="table"><thead><tr><th>{p.reports.code}</th><th>{p.reports.category}</th><th>{p.reports.severity}</th><th>{t.common.status}</th><th className="num">{p.reports.confirmations}</th><th>{p.reports.reported}</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td className="font-mono text-xs">{r.public_code}</td><td>{r.category}</td><td><Badge tone={severityTone(r.severity)}>{t.severity[r.severity as keyof typeof t.severity]}</Badge></td><td><Badge>{r.status}</Badge></td><td className="num">{r.confirmations_count}</td><td className="text-xs">{date(r.created_at, locale)}</td></tr>)}</tbody></table>
          ) : <EmptyState icon={TriangleAlert} title={p.reports.none} />}
      </TableCard>
    </>
  );
}
