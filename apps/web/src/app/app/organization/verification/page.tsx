import { FileText, MapPin, ShieldCheck } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Field, Notice, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';
import { uploadVerificationDocument } from '@/lib/actions/verification';

export const metadata = { title: 'Verification' };
type Area = { id: string; level: string; parent_id: string | null; name_en: string; name_ar: string; status: string };
type Org = { verification_status: 'pending' | 'submitted' | 'verified' | 'rejected' | 'suspended'; verification_note: string | null; verification_submitted_at: string | null; governorate_id: string | null; city_area_id: string | null; country_code: string };
const TONE = { pending: 'amber', submitted: 'blue', verified: 'green', rejected: 'red', suspended: 'red' } as const;

export default async function Verification() {
  const { org } = await requireOrg();
  const { t, locale } = await getAppDict();
  const v = t.verification;
  const sb = await supabaseServer();
  const [{ data: o }, { data: areas }, { data: docs }] = await Promise.all([
    sb.from('organizations').select('verification_status, verification_note, verification_submitted_at, governorate_id, city_area_id, country_code').eq('id', org.org_id).single(),
    sb.from('admin_areas').select('id, level, parent_id, name_en, name_ar, status').eq('country_code', org.country_code).order(locale === 'ar' ? 'name_ar' : 'name_en'),
    sb.from('org_documents').select('id, doc_kind, filename, created_at').eq('org_id', org.org_id).eq('entity_type', 'organization').order('created_at'),
  ]);
  const st = o as Org;
  const all = (areas ?? []) as Area[];
  const name = (a: Area) => (locale === 'ar' ? a.name_ar : a.name_en);
  const govs = all.filter((a) => a.level === 'governorate');
  const isOwner = org.role === 'owner';
  const editable = isOwner && (st.verification_status === 'pending' || st.verification_status === 'rejected');
  const docList = (docs ?? []) as { id: string; doc_kind: keyof typeof v.kinds; filename: string; created_at: string }[];
  return (
    <>
      <PageHeader title={v.title} subtitle={v.subtitle} actions={<Badge tone={TONE[st.verification_status]}>{v.status[st.verification_status]}</Badge>} />
      {st.verification_status === 'rejected' && st.verification_note ? <div className="mb-5"><Notice tone="red" title={v.reason}>{st.verification_note}</Notice></div> : null}
      {st.verification_status === 'submitted' && st.verification_submitted_at ? <div className="mb-5"><Notice tone="blue">{v.banner.submitted} · {v.submitted} {date(st.verification_submitted_at, locale)}</Notice></div> : null}
      {!isOwner ? <div className="mb-5"><Notice tone="amber">{v.ownerOnly}</Notice></div> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={v.jurisdiction} icon={MapPin} />
          <RpcForm rpc="set_org_jurisdiction" t={t} hidden={{ p_org: org.org_id }} revalidate="/app/organization/verification" className="space-y-4" testId="jurisdiction-form">
            <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
              <Field label={v.governorate} name="p_governorate" required>
                <select id="p_governorate" name="p_governorate" className="select" required defaultValue={st.governorate_id ?? ''}>
                  <option value="" disabled>—</option>
                  {govs.map((g) => <option key={g.id} value={g.id}>{name(g)}</option>)}
                </select>
              </Field>
              <Field label={v.city} name="p_city">
                <select id="p_city" name="p_city" className="select" defaultValue={st.city_area_id ?? ''}>
                  <option value="">{v.noCity}</option>
                  {govs.map((g) => {
                    const kids = all.filter((a) => a.parent_id === g.id);
                    return kids.length ? <optgroup key={g.id} label={name(g)}>{kids.map((c) => <option key={c.id} value={c.id}>{name(c)}{c.status === 'requested' ? ` (${v.requested})` : ''}</option>)}</optgroup> : null;
                  })}
                </select>
              </Field>
              <p className="sm:col-span-2 text-xs font-[600] text-ink-2">{v.requestArea}</p>
              <Field label={v.newAreaEn} name="p_new_area_en"><input id="p_new_area_en" name="p_new_area_en" className="input" maxLength={120} /></Field>
              <Field label={v.newAreaAr} name="p_new_area_ar"><input id="p_new_area_ar" name="p_new_area_ar" className="input" dir="rtl" maxLength={120} /></Field>
              <Field label={v.level} name="p_new_area_level">
                <select id="p_new_area_level" name="p_new_area_level" className="select" defaultValue="city">
                  {Object.entries(v.levels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <div className="flex items-end justify-end"><SubmitButton size="sm" testId="jurisdiction-submit">{v.saveJurisdiction}</SubmitButton></div>
            </fieldset>
          </RpcForm>
        </Card>
        <Card>
          <CardHeader title={v.documents} icon={FileText} subtitle={v.required} />
          {docList.length ? (
            <ul className="mb-4 divide-y divide-line rounded-xl border border-line" data-testid="verification-docs">
              {docList.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-[540]">{d.filename}</span><span className="text-xs text-ink-3">{v.kinds[d.doc_kind] ?? d.doc_kind}</span></span>
                  <span className="shrink-0 text-xs text-ink-3">{date(d.created_at, locale)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={FileText} title={v.none} />}
          {editable ? (
            <ActionForm action={uploadVerificationDocument} errors={t.errors} success={t.common.saved} resetOnSuccess className="grid gap-3 sm:grid-cols-2" testId="verification-upload">
              <input type="hidden" name="p_org" value={org.org_id} />
              <Field label={v.kind} name="p_doc_kind" required>
                <select id="p_doc_kind" name="p_doc_kind" className="select" defaultValue="official_letter">
                  {Object.entries(v.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label={v.file} name="file" required><input id="file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="input py-1.5" /></Field>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton size="sm" variant="secondary" testId="verification-upload-submit">{v.upload}</SubmitButton></div>
            </ActionForm>
          ) : null}
          <p className="mt-3 text-xs text-ink-3">{v.privacy}</p>
        </Card>
      </div>
      {editable ? (
        <Card className="mt-5">
          <CardHeader title={v.submit} icon={ShieldCheck} subtitle={v.required} />
          <RpcForm rpc="submit_org_verification" t={t} hidden={{ p_org: org.org_id }} revalidate="/app/organization/verification" testId="verification-submit-form">
            <SubmitButton testId="verification-submit">{v.submit}</SubmitButton>
          </RpcForm>
        </Card>
      ) : null}
    </>
  );
}
