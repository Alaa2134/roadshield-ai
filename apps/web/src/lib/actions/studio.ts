'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

export type Scenario = {
  strategy: string; currency: string; total_funding: number; allocated: number; unallocated: number; candidates: number; method: string;
  selected: { project_id: string; code: string; name: string; cost: number; road_km: number; safety_score: number; critical_items: number; priority: number }[];
  not_funded: { project_id: string; code: string; name: string; cost: number }[]; excluded: { project_id: string; code: string; name: string; reason: string }[];
  totals: { projects: number; road_km: number; safety_score: number };
};
export type StudioState = { ok: boolean; error?: string; result?: Scenario } | null;

export async function runScenario(_p: StudioState, form: FormData): Promise<StudioState> {
  const org = String(form.get('org') ?? ''); const funding = String(form.get('funding') ?? '').replace(/[\s,]/g, '');
  const strategy = String(form.get('strategy') ?? ''); const save = String(form.get('save') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(org) || !/^\d{1,16}(\.\d{1,2})?$/.test(funding)) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('optimize_budget', { p_org: org, p_funding: funding, p_strategy: strategy, p_save_name: save || null });
  if (error) return { ok: false, error: /^[A-Z_]+$/.test(error.message) ? error.message : 'generic' };
  if (save) revalidatePath('/app/budget-studio');
  return { ok: true, result: data as Scenario };
}
