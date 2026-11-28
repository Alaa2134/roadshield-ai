import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, Card, EmptyState, Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';

export const metadata = { title: 'Verification requests' };
const STATES = ['submitted', 'pending', 'rejected', 'verified', 'suspended'] as const;
type S = (typeof STATES)[number];
type Row = { org_id: string; name: string; name_ar: string | null; slug: string; org_type: string; country_code: string; governorate_en: string | null; governorate_ar: string | null;
  city_en: string | null; city_ar: string | null; city_status: string | null; creator_email: string | null; verification_status: S; submitted_at: string | null; documents: number; created_at: string };

export default async function VerificationQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/sign-in');
  if (!s.isPlatformAdmin) redirect('/app');
  const { t, locale } = await getAppDict();
  const v = t.verification;
  const status: S = (STATES as readonly string[]).includes((await searchParams).status ?? '') ? ((await searchParams).status as S) : 'submitted';
  const sb = await supabaseServer();
  const { data } = await sb.rpc('org_verification_queue', { p_status: status });
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.org_id);
  const { data: docs } = ids.length
    ? await sb.from('org_documents').select('id, org_id, doc_kind, filename, storage_path, created_at').eq('entity_type', 'organization').in('org_id', ids)
    : { data: [] };
  const signed = new Map<string, string>();
  await Promise.all(((docs ?? []) as { id: string; storage_path: string }[]).map(async (d) => {
    const { data: u } = await sb.storage.from('org-documents').createSignedUrl(d.storage_path, 600);
    if (u?.signedUrl) signed.set(d.id, u.signedUrl);
  }));
  const tone = { submitted: 'blue', pending: 'amber', rejected: 'red', verified: 'green', suspended: 'red' } as const;
  return (
    <>
      <PageHeader title={v.queue} subtitle={v.queueSubtitle} />
      <nav className="mb-5 flex flex-wrap gap-1 rounded-lg bg-sunken p-0.5 w-fit" aria-label={v.queue}>
        {STATES.map((k) => <Link key={k} href={`?status=${k}`} aria-current={k === status ? 'page' : undefined}
          className={`rounded-md px-3 py-1.5 text-[13px] ${k === status ? 'bg-surface font-[600] text-ink shadow-soft' : 'text-ink-2 hover:text-ink'}`}>{v.status[k]}</Link>)}
      </nav>
      {rows.length ? (
        <div className="grid gap-4" data-testid="verification-queue">
          {rows.map((r) => (
            <Card key={r.org_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-card">{locale === 'ar' && r.name_ar ? r.name_ar : r.name} <span className="font-mono text-xs text-ink-3">{r.slug}</span></p>
                  <p className="mt-1 text-sm text-ink-2">
                    {t.onboarding.types[r.org_type as keyof typeof t.onboarding.types] ?? r.org_type} · {r.country_code}
                    {r.governorate_en ? ` · ${locale === 'ar' ? r.governorate_ar : r.governorate_en}` : ''}
                    {r.city_en ? ` · ${locale === 'ar' ? r.city_ar : r.city_en}${r.city_status === 'requested' ? ` (${v.requested})` : ''}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-3">{v.creator}: {r.creator_email ?? '—'} · {date(r.submitted_at ?? r.created_at, locale)}</p>
                </div>
                <Badge tone={tone[r.verification_status]}>{v.status[r.verification_status]}</Badge>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {((docs ?? []) as { id: string; org_id: string; doc_kind: keyof typeof v.kinds; filename: string }[]).filter((d) => d.org_id === r.org_id).map((d) => (
                  <li key={d.id}>{signed.get(d.id)
                    ? <a href={signed.get(d.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-xs hover:border-accent"><ShieldCheck size={13} />{v.kinds[d.doc_kind] ?? d.doc_kind} · {d.filename}</a>
                    : <span className="inline-flex rounded-full border border-line px-2.5 py-1 text-xs">{d.filename}</span>}</li>
                ))}
              </ul>
              {r.verification_status === 'submitted' ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr]">
                  <RpcForm rpc="review_org_verification" t={t} hidden={{ p_org: r.org_id, p_approve: 'true' }} revalidate="/app/admin/verifications" testId={`approve-${r.slug}`}>
                    <SubmitButton size="sm">{v.approve}</SubmitButton>
                  </RpcForm>
                  <RpcForm rpc="review_org_verification" t={t} hidden={{ p_org: r.org_id, p_approve: 'false' }} revalidate="/app/admin/verifications" className="flex flex-wrap items-end gap-2">
                    <Field label={v.note} name="p_note"><input name="p_note" className="input" required minLength={3} maxLength={1000} /></Field>
                    <SubmitButton size="sm" variant="secondary">{v.reject}</SubmitButton>
                  </RpcForm>
                </div>
              ) : r.verification_status === 'verified' || r.verification_status === 'suspended' ? (
                <RpcForm rpc="set_org_suspended" t={t} hidden={{ p_org: r.org_id, p_suspended: r.verification_status === 'verified' ? 'true' : 'false' }} revalidate="/app/admin/verifications" className="mt-4 flex flex-wrap items-end gap-2">
                  <Field label={v.note} name="p_note"><input name="p_note" className="input" required minLength={3} maxLength={1000} /></Field>
                  <SubmitButton size="sm" variant="secondary">{r.verification_status === 'verified' ? v.suspend : v.reinstate}</SubmitButton>
                </RpcForm>
              ) : null}
            </Card>
          ))}
        </div>
      ) : <EmptyState icon={ShieldCheck} title={v.empty} />}
    </>
  );
}
