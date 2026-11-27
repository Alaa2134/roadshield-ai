import { Cpu, Database, PlayCircle, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date, num } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Field, Notice, PageHeader, TableCard } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';

export const metadata = { title: 'AI Model Center' };
type M = { id: string; kind: string; name: string; version: string; architecture: string; framework: string; license: string; provenance: string; provenance_notes: string | null;
  metrics: Record<string, unknown>; metrics_source: string | null; artifact_uri: string | null; artifact_sha256: string | null; status: string; approved_at: string | null; created_at: string };

function flatten(o: Record<string, unknown>, pre = ''): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Record<string, unknown>, `${pre}${k}.`) : [[`${pre}${k}`, String(v)]]));
}

export default async function ModelCenter() {
  const s = await getSession();
  if (!s) redirect('/sign-in');
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [{ data: ds }, { data: ms }, { data: runs }] = await Promise.all([
    sb.from('ml_datasets').select('*').order('created_at'), sb.from('ml_models').select('*').order('created_at', { ascending: false }),
    s.isPlatformAdmin ? sb.from('ml_training_runs').select('*').order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const models = (ms ?? []) as M[];
  const datasets = (ds ?? []) as { id: string; name: string; version: string; task: string; source_url: string; license: string; license_verified: boolean; license_notes: string | null; citation: string | null; classes: string[]; countries: string[]; num_images: number | null; status: string }[];
  const tone = (st: string) => (st === 'production' ? 'green' : st === 'candidate' ? 'amber' : st === 'rejected' ? 'red' : 'neutral') as 'green' | 'amber' | 'red' | 'neutral';
  return (
    <>
      <PageHeader title={p.models.title} subtitle={p.models.subtitle} />
      {!s.isPlatformAdmin ? <div className="mb-5"><Notice tone="blue" icon={ShieldAlert}>{p.models.adminOnly}</Notice></div> : null}
      <h2 className="t-section mb-3">{p.models.models}</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        {models.length ? models.map((m) => (
          <Card key={m.id}>
            <CardHeader title={m.name} subtitle={`${m.kind} · ${m.architecture} · ${m.framework}`} icon={Cpu}
              action={<Badge tone={tone(m.status)} dot>{p.models.status[m.status as keyof typeof p.models.status]}</Badge>} />
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge tone={m.provenance === 'third_party_pretrained' ? 'amber' : 'green'}>{p.models.provenance[m.provenance as keyof typeof p.models.provenance]}</Badge>
              <Badge>{p.models.licence}: {m.license}</Badge>
            </div>
            <p className="font-mono text-xs text-ink-2">{m.version}</p>
            {m.provenance_notes ? <p className="mt-3 text-sm leading-relaxed text-ink-2">{m.provenance_notes}</p> : null}
            <h3 className="t-label mt-4 mb-2">{p.models.metrics}</h3>
            {Object.keys(m.metrics).length ? (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl bg-sunken p-3 text-xs sm:grid-cols-2">{flatten(m.metrics).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="truncate text-ink-2">{k}</dt><dd className="font-[560] tabular">{v}</dd></div>)}</dl>
            ) : <p className="text-sm text-ink-3">{t.common.notRecorded}</p>}
            {m.kind === 'damage_detector' && !('mAP50' in m.metrics) ? <p className="mt-2 text-xs text-warn-text">{p.models.noMap}</p> : null}
            <p className="mt-3 text-xs text-ink-3">{p.models.metricsSource}: {m.metrics_source ?? '—'} · {p.models.artifact}: <span className="font-mono">{m.artifact_uri ?? '—'}</span></p>
            {s.isPlatformAdmin && m.status === 'candidate' ? (
              <div className="mt-4 flex justify-end gap-2">
                <RpcForm rpc="reject_model" t={t} hidden={{ p_model: m.id }} revalidate="/app/model-center"><SubmitButton size="sm" variant="secondary">{t.common.reject}</SubmitButton></RpcForm>
                <RpcForm rpc="approve_model_deployment" t={t} hidden={{ p_model: m.id }} revalidate="/app/model-center"><SubmitButton size="sm">{p.models.deploy}</SubmitButton></RpcForm>
              </div>
            ) : null}
          </Card>
        )) : <Card><EmptyState icon={Cpu} title={t.empty.models} /></Card>}
      </div>
      <h2 className="t-section mt-8 mb-3">{p.models.datasets}</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        {datasets.map((d) => (
          <Card key={d.id}>
            <CardHeader title={`${d.name} · ${d.version}`} subtitle={d.task} icon={Database} action={d.license_verified ? <Badge tone="green">{p.models.verifiedLicence}</Badge> : <Badge tone="amber">{t.common.pendingReview}</Badge>} />
            <dl className="space-y-1.5 text-sm">
              <div><dt className="t-label inline">{p.models.licence}: </dt><dd className="inline">{d.license}</dd></div>
              <div><dt className="t-label inline">{p.models.classes}: </dt><dd className="inline font-mono text-xs">{d.classes.join(' · ')}</dd></div>
              <div><dt className="t-label inline">{p.models.countries}: </dt><dd className="inline">{d.countries.join(', ')}</dd></div>
              <div><dt className="t-label inline">{p.models.images}: </dt><dd className="inline tabular">{num(d.num_images, locale)}</dd></div>
            </dl>
            {d.license_notes ? <p className="mt-3 text-xs text-ink-2">{d.license_notes}</p> : null}
            {d.citation ? <p className="mt-2 text-xs italic text-ink-3">{d.citation}</p> : null}
            <a href={d.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-[13px] font-[560] text-accent-text">{t.common.source}</a>
          </Card>
        ))}
      </div>
      {s.isPlatformAdmin ? (
        <div className="mt-8 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <TableCard title={p.models.runs}>
            {(runs ?? []).length ? <table className="table"><tbody>{((runs ?? []) as { id: string; model_kind: string; status: string; created_at: string }[]).map((r) => <tr key={r.id}><td>{r.model_kind}</td><td><Badge>{r.status}</Badge></td><td className="text-xs">{date(r.created_at, locale, true)}</td></tr>)}</tbody></table>
              : <p className="px-5 py-4 text-sm text-ink-2">{t.common.none}</p>}
          </TableCard>
          <Card><CardHeader title={p.models.request} icon={PlayCircle} />
            <RpcForm rpc="request_training_run" t={t} hidden={{ p_params: '{}' }} revalidate="/app/model-center" className="grid gap-3">
              <Field label="Kind" name="p_kind"><select name="p_kind" className="select"><option value="damage_detector">damage_detector</option><option value="cost_model">cost_model</option></select></Field>
              <Field label={p.models.datasets} name="p_dataset"><select name="p_dataset" className="select"><option value="">—</option>{datasets.map((d) => <option key={d.id} value={d.id}>{d.name} {d.version}</option>)}</select></Field>
              <div className="flex justify-end"><SubmitButton size="sm">{p.models.request}</SubmitButton></div>
            </RpcForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}
