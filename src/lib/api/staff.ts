import { unwrap } from '../errors';
import { supabase } from '../supabase';
import type {
  AdminMetrics,
  AdminUser,
  AuditLog,
  Hazard,
  HazardCategory,
  ImageKind,
  MaintenanceTask,
  QueueItem,
  ReportStatus,
  TaskStatus,
  TaskUpdate,
  UserRole,
} from '../types';

/* ---------------------------------------------------------------- maintenance officers */
export type QueueScope = 'mine' | 'unassigned' | 'history' | 'all_open';

export async function officerQueue(scope: QueueScope, search: string | null, category: HazardCategory | null) {
  return ((unwrap(
    await supabase.rpc('officer_queue', {
      p_scope: scope,
      p_search: search || null,
      p_category: category,
      p_limit: 100,
      p_offset: 0,
    }),
  ) as QueueItem[] | null) ?? []);
}

export async function assignHazard(hazardId: string, officerId: string | null, dueDate: string | null = null) {
  return unwrap(
    await supabase.rpc('assign_hazard', { p_hazard_id: hazardId, p_officer_id: officerId, p_due_date: dueDate }),
  ) as { task_id: string };
}

export async function updateTask(taskId: string, status: TaskStatus | null, note: string | null) {
  return unwrap(await supabase.rpc('update_task', { p_task_id: taskId, p_status: status, p_note: note }));
}

export async function attachTaskImage(taskId: string, path: string, kind: Extract<ImageKind, 'before' | 'after'>, w: number, h: number, blurred: boolean) {
  return unwrap(
    await supabase.rpc('attach_task_image', {
      p_task_id: taskId,
      p_path: path,
      p_kind: kind,
      p_privacy_blurred: blurred,
      p_width: w,
      p_height: h,
    }),
  ) as string | null;
}

export async function getTask(taskId: string): Promise<MaintenanceTask | null> {
  const res = await supabase
    .from('maintenance_tasks')
    .select('id, hazard_id, assigned_to, assigned_by, status, due_date, started_at, completion_requested_at, completed_at, created_at, updated_at')
    .eq('id', taskId)
    .maybeSingle();
  return unwrap(res) as MaintenanceTask | null;
}

export async function tasksForHazard(hazardId: string): Promise<MaintenanceTask[]> {
  const res = await supabase
    .from('maintenance_tasks')
    .select('id, hazard_id, assigned_to, assigned_by, status, due_date, started_at, completion_requested_at, completed_at, created_at, updated_at')
    .eq('hazard_id', hazardId)
    .order('created_at', { ascending: false });
  return (unwrap(res) as MaintenanceTask[] | null) ?? [];
}

export async function taskUpdates(taskId: string): Promise<TaskUpdate[]> {
  const res = await supabase
    .from('task_updates')
    .select('id, task_id, author_id, status, note, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  return (unwrap(res) as TaskUpdate[] | null) ?? [];
}

/* ---------------------------------------------------------------- administrators */
export async function adminMetrics(days = 30): Promise<AdminMetrics> {
  return unwrap(await supabase.rpc('admin_metrics', { p_days: days })) as AdminMetrics;
}

export type HeatCell = { latitude: number; longitude: number; hazard_count: number; avg_priority: number; max_priority: number };
export async function priorityHeatmap(cellDeg = 0.005): Promise<HeatCell[]> {
  return ((unwrap(await supabase.rpc('priority_heatmap', { p_cell_deg: cellDeg })) as HeatCell[] | null) ?? []);
}

export async function moderationQueue(): Promise<Hazard[]> {
  const res = await supabase
    .from('hazards')
    .select(
      'id, public_code, reporter_id, category, severity, status, description, latitude, longitude, address, city, location_source, location_accuracy_m, duplicate_of, traffic_exposure, confirmations_count, ai_detection_id, created_at, updated_at, verified_at, resolved_at, priority',
    )
    .in('status', ['submitted', 'under_review', 'reopened'])
    .order('created_at', { ascending: true })
    .limit(100);
  return (unwrap(res) as Hazard[] | null) ?? [];
}

export async function transitionHazard(args: {
  hazardId: string;
  to: ReportStatus;
  note?: string | null;
  duplicateOf?: string | null;
  approveImages?: boolean | null;
}) {
  return unwrap(
    await supabase.rpc('transition_hazard', {
      p_hazard_id: args.hazardId,
      p_to: args.to,
      p_note: args.note || null,
      p_duplicate_of: args.duplicateOf ?? null,
      p_approve_images: args.approveImages ?? null,
    }),
  );
}

export async function setTrafficExposure(hazardId: string, level: number | null) {
  unwrap(await supabase.rpc('set_traffic_exposure', { p_hazard_id: hazardId, p_level: level }));
}

export async function setImagePrivacy(imageId: string, approved: boolean) {
  unwrap(await supabase.rpc('set_image_privacy', { p_image_id: imageId, p_approved: approved }));
}

export async function listUsers(search: string | null, role: UserRole | null): Promise<AdminUser[]> {
  return ((unwrap(
    await supabase.rpc('admin_list_users', { p_search: search || null, p_role: role, p_limit: 100, p_offset: 0 }),
  ) as AdminUser[] | null) ?? []);
}

export async function setRole(userId: string, role: UserRole) {
  unwrap(await supabase.rpc('admin_set_role', { p_user_id: userId, p_role: role }));
}

export async function setSuspended(userId: string, suspended: boolean) {
  unwrap(await supabase.rpc('admin_set_suspended', { p_user_id: userId, p_suspended: suspended }));
}

export type Officer = { id: string; full_name: string; email: string; role: UserRole; open_tasks: number };
export async function listOfficers(): Promise<Officer[]> {
  return ((unwrap(await supabase.rpc('list_officers')) as Officer[] | null) ?? []);
}

export async function auditLogs(before?: number): Promise<AuditLog[]> {
  let q = supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, details, created_at')
    .order('id', { ascending: false })
    .limit(50);
  if (before) q = q.lt('id', before);
  return (unwrap(await q) as AuditLog[] | null) ?? [];
}

export async function sendAnnouncement(titleEn: string, bodyEn: string, titleAr: string, bodyAr: string) {
  return unwrap(
    await supabase.rpc('send_announcement', {
      p_title_en: titleEn,
      p_body_en: bodyEn,
      p_title_ar: titleAr,
      p_body_ar: bodyAr,
    }),
  ) as number;
}
