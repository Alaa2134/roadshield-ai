import { supabase } from '../supabase';
import { unwrap } from '../errors';

/** Enterprise (RoadShield OS) access for engineers, inspectors and contractors. All reads are
 *  filtered by row level security; all writes go through role-checked RPCs. */
export type OrgRole = 'owner' | 'finance_manager' | 'road_engineer' | 'field_inspector' | 'contractor' | 'executive_viewer';
export type Membership = { org_id: string; name: string; name_ar: string | null; role: OrgRole; default_currency: string; contractor_id: string | null };
export type WorkOrder = { id: string; org_id: string; project_id: string; code: string; title: string; description: string; status: string;
  progress_pct: number; due_date: string | null; contractor_id: string | null; assigned_engineer: string | null };
export type WorkLog = { id: string; log_date: string; note: string; progress_pct: number | null; photo_paths: string[]; created_at: string };
export type RoadHit = { id: string; name: string | null; name_ar: string | null; ref: string | null; highway_class: string; condition: string; length_m: number; lon: number; lat: number };
export type DefectClass = 'D00_longitudinal_crack' | 'D10_transverse_crack' | 'D20_alligator_crack' | 'D40_pothole' | 'rutting' | 'edge_break' | 'patch_failure' | 'other';
export const DEFECT_CLASSES: DefectClass[] = ['D00_longitudinal_crack', 'D10_transverse_crack', 'D20_alligator_crack', 'D40_pothole', 'rutting', 'edge_break', 'patch_failure', 'other'];
export const FIELD_ROLES: OrgRole[] = ['owner', 'road_engineer', 'field_inspector', 'contractor'];

export async function myOrganizations(): Promise<Membership[]> {
  return (unwrap(await supabase.rpc('my_organizations')) ?? []) as Membership[];
}

export async function myWorkOrders(orgId: string): Promise<WorkOrder[]> {
  const res = await supabase.from('work_orders').select('id, org_id, project_id, code, title, description, status, progress_pct, due_date, contractor_id, assigned_engineer')
    .eq('org_id', orgId).in('status', ['issued', 'in_progress', 'submitted', 'rejected']).order('due_date', { ascending: true, nullsFirst: false });
  return (unwrap(res) ?? []) as WorkOrder[];
}

export async function workOrder(id: string): Promise<{ wo: WorkOrder; logs: WorkLog[] } | null> {
  const res = await supabase.from('work_orders').select('*').eq('id', id).maybeSingle();
  const wo = unwrap(res) as WorkOrder | null;
  if (!wo) return null;
  const logs = unwrap(await supabase.from('work_logs').select('id, log_date, note, progress_pct, photo_paths, created_at').eq('work_order_id', id).order('created_at', { ascending: false })) as WorkLog[];
  return { wo, logs: logs ?? [] };
}

export async function transitionWorkOrder(id: string, to: string, note?: string) {
  unwrap(await supabase.rpc('transition_work_order', { p_id: id, p_to: to, p_note: note ?? null }));
}

export async function searchRoads(orgId: string, query: string): Promise<RoadHit[]> {
  if (query.trim().length < 2) return [];
  return (unwrap(await supabase.rpc('search_roads', { p_org: orgId, p_query: query.trim(), p_limit: 20 })) ?? []) as RoadHit[];
}

export async function pendingInspections(orgId: string): Promise<number> {
  const res = await supabase.from('road_inspections').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'submitted');
  return res.count ?? 0;
}
