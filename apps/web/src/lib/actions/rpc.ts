'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/components/ui/client';

type T = 'uuid' | 'uuid?' | 'text' | 'text?' | 'int' | 'int?' | 'numeric' | 'numeric?' | 'date' | 'date?' | 'bool' | 'json' | 'uuid[]' | 'timestamptz';

// Allow-list of RPCs the web app may call, with parameter types. Every function re-checks the
// caller's organization role and record state inside Postgres; this list only shapes input.
const SPEC: Record<string, Record<string, T>> = {
  create_organization: { p_name: 'text', p_slug: 'text', p_country_code: 'text', p_currency: 'text', p_timezone: 'text', p_org_type: 'text', p_city: 'text?', p_region: 'text?', p_name_ar: 'text?', p_locale: 'text' },
  update_organization: { p_org: 'uuid', p_patch: 'json' },
  set_service_area: { p_org: 'uuid', p_geojson: 'json' },
  invite_member: { p_org: 'uuid', p_email: 'text', p_role: 'text', p_contractor_id: 'uuid?' },
  accept_invitation: { p_token: 'text' },
  revoke_invitation: { p_id: 'uuid' },
  set_member_role: { p_org: 'uuid', p_user: 'uuid', p_role: 'text', p_contractor_id: 'uuid?' },
  remove_member: { p_org: 'uuid', p_user: 'uuid' },
  review_inspection: { p_id: 'uuid', p_approve: 'bool', p_note: 'text?' },
  upsert_contractor: { p_org: 'uuid', p_id: 'uuid?', p_name: 'text', p_registration_no: 'text?', p_contact_name: 'text?', p_contact_email: 'text?', p_phone: 'text?', p_qualifications: 'text', p_status: 'text' },
  create_project: { p_org: 'uuid', p_code: 'text', p_name: 'text', p_description: 'text', p_priority: 'int', p_repair_method: 'text?', p_road_ids: 'uuid[]', p_planned_start: 'date?', p_planned_end: 'date?', p_verified_damaged_area_m2: 'numeric?' },
  update_project: { p_project: 'uuid', p_patch: 'json' },
  transition_project: { p_project: 'uuid', p_to: 'text', p_note: 'text?' },
  add_unit_rate: { p_org: 'uuid', p_category: 'text', p_description: 'text', p_unit: 'text', p_rate: 'numeric', p_currency: 'text', p_rate_kind: 'text', p_effective_date: 'date', p_source_kind: 'text', p_source_title: 'text', p_source_url: 'text?', p_region: 'text?' },
  verify_unit_rate: { p_id: 'uuid' },
  submit_budget: { p_org: 'uuid', p_project: 'uuid?', p_road: 'uuid?', p_fiscal_year: 'int', p_label: 'text', p_amount: 'numeric', p_currency: 'text', p_funding_source: 'text?' },
  review_budget: { p_id: 'uuid', p_approve: 'bool', p_note: 'text?' },
  submit_estimate: { p_project: 'uuid', p_lines: 'json', p_assumptions: 'text' },
  review_estimate: { p_id: 'uuid', p_approve: 'bool', p_note: 'text?' },
  create_contract: { p_project: 'uuid', p_contractor: 'uuid', p_reference: 'text', p_signed_on: 'date', p_amount: 'numeric', p_retention_pct: 'numeric', p_warranty_months: 'int?' },
  submit_change_order: { p_contract: 'uuid', p_amount: 'numeric', p_reason: 'text' },
  review_change_order: { p_id: 'uuid', p_approve: 'bool' },
  create_work_order: { p_project: 'uuid', p_code: 'text', p_title: 'text', p_description: 'text', p_contractor: 'uuid?', p_engineer: 'uuid?', p_due_date: 'date?' },
  transition_work_order: { p_id: 'uuid', p_to: 'text', p_note: 'text?' },
  add_work_log: { p_work_order: 'uuid', p_log_date: 'date', p_note: 'text', p_progress_pct: 'int?' },
  submit_cost_item: { p_project: 'uuid', p_work_order: 'uuid?', p_category: 'text', p_description: 'text', p_unit: 'text', p_quantity: 'numeric', p_unit_rate: 'numeric', p_cost_date: 'date', p_source_kind: 'text' },
  review_cost_item: { p_id: 'uuid', p_approve: 'bool', p_note: 'text?' },
  submit_invoice: { p_contract: 'uuid', p_invoice_number: 'text', p_invoice_date: 'date', p_net_amount: 'numeric', p_tax_amount: 'numeric' },
  review_invoice: { p_id: 'uuid', p_approve: 'bool', p_note: 'text?' },
  record_payment: { p_invoice: 'uuid', p_amount: 'numeric', p_paid_on: 'date', p_reference: 'text' },
  optimize_budget: { p_org: 'uuid', p_funding: 'numeric', p_strategy: 'text', p_save_name: 'text?' },
  request_training_run: { p_kind: 'text', p_dataset: 'uuid?', p_params: 'json' },
  approve_model_deployment: { p_model: 'uuid' },
  reject_model: { p_model: 'uuid' },
  import_road_segments: { p_org: 'uuid', p_features: 'json', p_source: 'text', p_license: 'text', p_retrieved_at: 'timestamptz', p_city: 'text?', p_region: 'text?' },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^-?\d{1,16}(\.\d{1,4})?$/;

function coerce(t: T, raw: FormDataEntryValue | FormDataEntryValue[] | null): unknown {
  const opt = t.endsWith('?');
  const base = t.replace('?', '') as T;
  if (base === 'uuid[]') {
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean);
    if (list.some((v) => !UUID.test(v))) throw new Error('INVALID_INPUT');
    return list;
  }
  const v = raw === null || Array.isArray(raw) ? (Array.isArray(raw) ? String(raw[0] ?? '') : '') : String(raw).trim();
  if (v === '') {
    if (opt) return null;
    if (base === 'bool') return false;
    if (base === 'text') return '';
    throw new Error('INVALID_INPUT');
  }
  switch (base) {
    case 'uuid': if (!UUID.test(v)) throw new Error('INVALID_INPUT'); return v;
    case 'int': if (!/^-?\d{1,9}$/.test(v)) throw new Error('INVALID_INPUT'); return Number(v);
    // Decimals are passed as strings so no binary floating point touches money.
    case 'numeric': { const n = v.replace(/[\s,]/g, ''); if (!DECIMAL.test(n)) throw new Error('INVALID_INPUT'); return n; }
    case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('INVALID_INPUT'); return v;
    case 'timestamptz': if (Number.isNaN(Date.parse(v))) throw new Error('INVALID_INPUT'); return new Date(v).toISOString();
    case 'bool': return v === 'true' || v === 'on' || v === '1';
    case 'json': try { return JSON.parse(v); } catch { throw new Error('INVALID_INPUT'); }
    default: return v;
  }
}

export async function runRpc(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const fn = String(form.get('_rpc') ?? '');
  const spec = SPEC[fn];
  if (!spec) return { ok: false, error: 'FORBIDDEN' };
  const args: Record<string, unknown> = {};
  try {
    for (const [p, t] of Object.entries(spec)) {
      args[p] = coerce(t, t === 'uuid[]' ? form.getAll(p) : form.get(p));
    }
  } catch {
    return { ok: false, error: 'INVALID_INPUT' };
  }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : error.code === '23514' || error.code === '22P02' ? 'INVALID_INPUT' : 'generic';
    return { ok: false, error: code };
  }
  if (fn === 'create_organization' || fn === 'accept_invitation') {
    (await cookies()).set('rs_org', String(data), { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 31536000 });
  }
  const reval = form.getAll('_revalidate').map(String).filter((p) => p.startsWith('/app'));
  (reval.length ? reval : ['/app']).forEach((p) => revalidatePath(p, 'layout'));
  const redirectTo = String(form.get('_redirect') ?? '');
  const message = fn === 'invite_member' && data && typeof data === 'object' ? `TOKEN:${(data as { token: string }).token}` : undefined;
  return {
    ok: true, message,
    redirect: redirectTo.startsWith('/app') ? redirectTo.replace('{id}', typeof data === 'string' ? data : '') : undefined,
  };
}

export async function switchOrg(orgId: string) {
  if (!UUID.test(orgId)) return;
  (await cookies()).set('rs_org', orgId, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 31536000 });
  revalidatePath('/app', 'layout');
}
