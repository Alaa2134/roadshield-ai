import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, NotebookPen } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, Card, CardHeader, DefinitionList, EmptyState, Field, PageHeader, Progress, woTone } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';

export default async function WorkOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const { data } = await sb.from('work_orders').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const w = data as { id: string; code: string; title: string; description: string; status: string; progress_pct: number; due_date: string | null; issued_at: string | null;
    submitted_at: string | null; accepted_at: string | null; project_id: string; contractor_id: string | null; assigned_engineer: string | null };
  const [{ data: logs }, { data: prj }, { data: ctr }] = await Promise.all([
    sb.from('work_logs').select('*').eq('work_order_id', id).order('created_at', { ascending: false }),
    sb.from('maintenance_projects').select('id, code, name').eq('id', w.project_id).maybeSingle(),
    w.contractor_id ? sb.from('contractors').select('name').eq('id', w.contractor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const role = org.role;
  const mineContractor = role === 'contractor' && org.contractor_id === w.contractor_id;
  const staff = role === 'owner' || role === 'road_engineer' || (role === 'field_inspector' && w.assigned_engineer === user.id);
  const actions: string[] = [];
  if (w.status === 'draft' && (role === 'owner' || role === 'road_engineer')) actions.push('issued');
  if (['issued', 'rejected'].includes(w.status) && (mineContractor || staff)) actions.push('in_progress');
  if (w.status === 'in_progress' && (mineContractor || staff)) actions.push('submitted');
  if (w.status === 'submitted' && (role === 'owner' || role === 'road_engineer')) actions.push('accepted', 'rejected');
  if (!['accepted', 'cancelled'].includes(w.status) && (role === 'owner' || role === 'road_engineer')) actions.push('cancelled');
  const path = `/app/work-orders/${id}`;
  const canLog = ['issued', 'in_progress', 'rejected', 'submitted'].includes(w.status) && (mineContractor || staff);
  const project = prj as { id: string; code: string; name: string } | null;
  return (
    <>
      <PageHeader title={w.title} eyebrow={<Link href="/app/work-orders" className="text-xs font-[560] text-accent-text">← {p.workOrders.title}</Link>}
        subtitle={`${w.code}${project ? ` · ${project.code}` : ''}`}
        actions={<Badge tone={woTone(w.status)} dot className="h-7 px-3 text-xs">{t.woStatus[w.status as keyof typeof t.woStatus]}</Badge>} />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title={p.workOrders.progress} icon={ClipboardList} />
            <div className="flex items-center gap-3"><Progress value={w.progress_pct} tone="teal" /><span className="text-sm font-[600] tabular">{w.progress_pct}%</span></div>
            {actions.length ? (
              <RpcForm rpc="transition_work_order" t={t} hidden={{ p_id: id }} revalidate={[path, '/app/work-orders']} className="mt-5 space-y-3" testId="wo-transition">
                <Field label={p.workOrders.note} name="p_note"><input name="p_note" className="input" /></Field>
                <div className="flex flex-wrap justify-end gap-2">
                  {actions.map((a) => <SubmitButton key={a} size="sm" variant={a === 'cancelled' || a === 'rejected' ? 'secondary' : 'primary'} name="p_to" value={a} testId={`wo-${a}`}>{t.woStatus[a as keyof typeof t.woStatus]}</SubmitButton>)}
                </div>
              </RpcForm>
            ) : null}
          </Card>
          <Card>
            <CardHeader title={p.workOrders.logs} icon={NotebookPen} />
            {(logs ?? []).length ? (
              <ol className="space-y-4">{((logs ?? []) as { id: string; log_date: string; note: string; progress_pct: number | null; photo_paths: string[] }[]).map((l) => (
                <li key={l.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex justify-between text-xs text-ink-2"><span>{date(l.log_date, locale)}</span>{l.progress_pct !== null ? <span className="tabular">{l.progress_pct}%</span> : null}</div>
                  <p className="mt-1">{l.note}</p>
                  {l.photo_paths.length ? <p className="mt-1 text-xs text-ink-3">{l.photo_paths.length} photo(s)</p> : null}
                </li>))}</ol>
            ) : <EmptyState compact icon={NotebookPen} title={t.common.none} />}
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <DefinitionList items={[
              { label: p.finance.project, value: project ? <Link className="text-accent-text hover:underline" href={`/app/projects/${project.id}`}>{project.code} · {project.name}</Link> : '—' },
              { label: p.projects.contractor, value: (ctr as { name: string } | null)?.name ?? '—' },
              { label: p.projects.due, value: date(w.due_date, locale) },
              { label: t.woStatus.issued, value: date(w.issued_at, locale, true) },
              { label: t.woStatus.submitted, value: date(w.submitted_at, locale, true) },
              { label: t.woStatus.accepted, value: date(w.accepted_at, locale, true) },
            ]} />
            {w.description ? <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">{w.description}</p> : null}
          </Card>
          {canLog ? (
            <Card><CardHeader title={p.workOrders.log} />
              <RpcForm rpc="add_work_log" t={t} hidden={{ p_work_order: id }} revalidate={path} resetOnSuccess className="grid gap-3" testId="wo-log">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={p.workOrders.date} name="p_log_date" required><input type="date" name="p_log_date" className="input" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                  <Field label={`${p.workOrders.progress} %`} name="p_progress_pct"><input name="p_progress_pct" className="input" inputMode="numeric" /></Field>
                </div>
                <Field label={p.workOrders.note} name="p_note" required><textarea name="p_note" className="textarea" rows={3} required /></Field>
                <div className="flex justify-end"><SubmitButton size="sm">{t.common.save}</SubmitButton></div>
              </RpcForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
