/** Domain types mirroring the Supabase schema (supabase/migrations). */

export const HAZARD_CATEGORIES = [
  'pothole',
  'crack',
  'surface_damage',
  'flooding',
  'damaged_signage',
  'obstruction',
  'street_lighting',
  'other',
] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

/** Categories the trained detection model can predict. Others are reported manually. */
export const AI_CATEGORIES: readonly HazardCategory[] = ['pothole', 'crack', 'surface_damage'];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type HazardSeverity = (typeof SEVERITIES)[number];

export type ReportStatus =
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'duplicate'
  | 'reopened';

export type TaskStatus = 'assigned' | 'in_progress' | 'completion_requested' | 'completed' | 'cancelled';
export type UserRole = 'citizen' | 'maintenance_officer' | 'admin';
export type ImageKind = 'report' | 'additional' | 'before' | 'after';
export type NotificationType =
  | 'report_confirmation'
  | 'verification_update'
  | 'nearby_hazard'
  | 'maintenance_progress'
  | 'report_resolved'
  | 'system_announcement';

export type PriorityFactor = {
  key: 'severity' | 'confirmations' | 'age_days' | 'traffic_exposure' | 'maintenance_status';
  input: string | number | null;
  score: number | null;
  weight: number;
};

export type Priority = {
  model: string;
  score: number;
  level: 'low' | 'medium' | 'high' | 'none';
  active: boolean;
  factors: PriorityFactor[];
};

export type HazardSummary = {
  id: string;
  public_code: string;
  category: HazardCategory;
  severity: HazardSeverity;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  confirmations_count: number;
  created_at: string;
  verified_at: string | null;
  priority: Priority | null;
  distance_m?: number;
};

export type Hazard = HazardSummary & {
  reporter_id: string | null;
  description: string;
  location_source: 'gps' | 'manual';
  location_accuracy_m: number | null;
  duplicate_of: string | null;
  traffic_exposure: number | null;
  ai_detection_id: string | null;
  resolved_at: string | null;
  updated_at: string;
};

export type StatusEvent = {
  id: number;
  hazard_id: string;
  from_status: ReportStatus | null;
  to_status: ReportStatus;
  note: string | null;
  created_at: string;
};

export type HazardImage = {
  id: string;
  hazard_id: string;
  task_id: string | null;
  uploader_id: string | null;
  storage_path: string;
  kind: ImageKind;
  privacy_blurred: boolean;
  privacy_approved: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
};

export type Detection = {
  category: 'pothole' | 'crack' | 'surface_damage';
  label: string;
  confidence: number;
  /** Normalised [x1, y1, x2, y2] in 0..1 image coordinates. */
  box: [number, number, number, number];
};

export type AiDetectionRow = {
  id: string;
  model_name: string;
  model_version: string;
  top_category: HazardCategory | null;
  top_confidence: number | null;
  detections: Detection[];
  user_accepted_category: boolean | null;
};

export type Profile = {
  id: string;
  full_name: string;
  avatar_path: string | null;
  locale: 'en' | 'ar';
  home_city: string | null;
  notify_status_updates: boolean;
  notify_nearby: boolean;
  notify_announcements: boolean;
  nearby_radius_m: number;
  suspended_at: string | null;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  title_en: string;
  body_en: string;
  title_ar: string;
  body_ar: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type SavedLocation = { id: string; label: string; latitude: number; longitude: number; created_at: string };

export type MyStats = {
  total: number;
  pending: number;
  active: number;
  resolved: number;
  closed: number;
  confirmations_given: number;
};

export type ActivityItem = {
  hazard_id: string;
  public_code: string;
  category: HazardCategory;
  from_status: ReportStatus | null;
  to_status: ReportStatus;
  note: string | null;
  created_at: string;
};

export type QueueItem = {
  hazard_id: string;
  public_code: string;
  category: HazardCategory;
  severity: HazardSeverity;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  confirmations_count: number;
  created_at: string;
  verified_at: string | null;
  priority: Priority;
  priority_score: number;
  task_id: string | null;
  task_status: TaskStatus | null;
  assigned_to: string | null;
  assignee_name: string | null;
  due_date: string | null;
  task_updated_at: string | null;
};

export type MaintenanceTask = {
  id: string;
  hazard_id: string;
  assigned_to: string | null;
  assigned_by: string | null;
  status: TaskStatus;
  due_date: string | null;
  started_at: string | null;
  completion_requested_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  author_id: string | null;
  status: TaskStatus | null;
  note: string | null;
  created_at: string;
};

export type AdminMetrics = {
  generated_at: string;
  period_days: number;
  totals: {
    total_reports: number;
    active_hazards: number;
    pending_verification: number;
    resolved: number;
    closed: number;
    reports_in_period: number;
    resolved_in_period: number;
  };
  resolution_hours: { count: number; avg: number | null; median: number | null; p90: number | null };
  by_status: Partial<Record<ReportStatus, number>>;
  by_category: { category: HazardCategory; count: number }[];
  by_region: { region: string; count: number }[];
  daily: { day: string; reported: number; resolved: number }[];
  priority_levels: { high: number; medium: number; low: number };
  workload: {
    officer_id: string;
    name: string;
    assigned: number;
    in_progress: number;
    completion_requested: number;
    completed_in_period: number;
  }[];
  users: { total: number; citizens: number; officers: number; admins: number };
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  suspended_at: string | null;
  report_count: number;
  open_tasks: number;
};

export type AuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type LatLng = { latitude: number; longitude: number };
