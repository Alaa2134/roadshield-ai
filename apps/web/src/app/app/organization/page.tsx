import { Building2, Gauge, ScrollText, MapPinned } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, num, relative } from '@/lib/format';
import { Card, CardHeader, DefinitionList, Field, PageHeader, Progress, TableCard } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';
import { OrgSettingsForm } from '@/components/app/OrgSettingsForm';

export const metadata = { title: 'Organization' };

export default async function Organization() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [{ data: o }, { data: plan }, { data: ov }, audit] = await Promise.all([
    sb.from('organizations').select('*').eq('id', org.org_id).maybeSingle(),
    sb.from('plans').select('*').eq('code', org.plan_code).maybeSingle(),
    sb.rpc('org_overview', { p_org: org.org_id }),
    org.role === 'owner' ? sb.rpc('org_activity', { p_org: org.org_id, p_limit: 50 }) : Promise.resolve({ data: [] }),
  ]);
  const og = o as Record<string, string | boolean | null>;
  const pl = plan as { name: string; max_members: number | null; max_road_segments: number | null; features: string[] } | null;
  const n = (ov as { network: { members: number; road_segments: number } } | null)?.network;
  const quota = (used: number, max: number | null) => (
    <div><div className="mb-1 flex justify-between text-xs"><span className="tabular">{num(used, locale)}</span><span className="text-ink-3">{max ? num(max, locale) : p.org.unlimited}</span></div>{max ? <Progress value={(used / max) * 100} /> : null}</div>
  );
  return (
    <>
      <PageHeader title={p.org.title} subtitle={p.org.subtitle} />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title={p.org.settings} icon={Building2} />
            {org.role === 'owner' ? <OrgSettingsForm org={og} t={t} labels={{ ...p.org, name: t.onboarding.orgName, nameAr: t.onboarding.orgNameAr, city: t.onboarding.city, region: t.onboarding.region, timezone: t.onboarding.timezone }} />
              : <DefinitionList items={[{ label: t.onboarding.orgName, value: String(og.name) }, { label: t.onboarding.country, value: String(og.country_code) }, { label: t.common.currency, value: String(og.default_currency) }, { label: t.onboarding.timezone, value: String(og.timezone) }]} />}
          </Card>
          {org.role === 'owner' ? (
            <Card>
              <CardHeader title={p.org.serviceArea} icon={MapPinned} subtitle={og.service_area ? '✓' : t.overview.setServiceArea} />
              <RpcForm rpc="set_service_area" t={t} hidden={{ p_org: org.org_id }} revalidate="/app/organization" className="space-y-3">
                <textarea name="p_geojson" className="textarea font-mono text-xs" rows={5} placeholder='{"type":"Polygon","coordinates":[[[31.615,31.405],[31.745,31.405],[31.745,31.475],[31.615,31.475],[31.615,31.405]]]}' required />
                <div className="flex justify-end"><SubmitButton size="sm" variant="secondary">{t.common.save}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title={p.org.plan} icon={Gauge} subtitle={pl?.name} />
            <div className="space-y-4 text-sm">
              <div><p className="t-label mb-1.5">{t.nav.users}</p>{quota(n?.members ?? 0, pl?.max_members ?? null)}</div>
              <div><p className="t-label mb-1.5">{p.roads.title}</p>{quota(n?.road_segments ?? 0, pl?.max_road_segments ?? null)}</div>
              <div className="flex flex-wrap gap-1.5 pt-1">{(pl?.features ?? []).map((f) => <span key={f} className="badge bg-sunken text-ink-2">{f}</span>)}</div>
            </div>
          </Card>
          {org.role === 'owner' ? (
            <TableCard title={p.org.audit} action={<a href="/api/export/audit" className="text-[13px] font-[560] text-accent-text">{t.common.export}</a>}>
              <table className="table"><tbody>{((audit.data ?? []) as { id: number; action: string; actor_name: string | null; created_at: string }[]).map((a) => (
                <tr key={a.id}><td className="font-mono text-xs">{a.action}</td><td className="text-xs text-ink-2">{a.actor_name ?? '—'}</td><td className="text-xs text-ink-3 whitespace-nowrap" title={date(a.created_at, locale, true)}>{relative(a.created_at, locale)}</td></tr>))}</tbody></table>
              {!(audit.data ?? []).length ? <p className="px-5 py-4 text-sm text-ink-2"><ScrollText size={14} className="me-1 inline" />{t.empty.activity}</p> : null}
            </TableCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
