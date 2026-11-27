import { unwrap } from '../errors';
import type { BBox } from '../geo';
import { supabase } from '../supabase';
import type {
  ActivityItem,
  AiDetectionRow,
  Hazard,
  HazardCategory,
  HazardImage,
  HazardSeverity,
  HazardSummary,
  MyStats,
  StatusEvent,
} from '../types';

const HAZARD_COLUMNS =
  'id, public_code, reporter_id, category, severity, status, description, latitude, longitude, address, city, location_source, location_accuracy_m, duplicate_of, traffic_exposure, confirmations_count, ai_detection_id, created_at, updated_at, verified_at, resolved_at, priority';

export async function nearbyHazards(lat: number, lng: number, radiusM = 2000, limit = 50): Promise<HazardSummary[]> {
  const data = unwrap(
    await supabase.rpc('nearby_hazards', { p_lat: lat, p_lng: lng, p_radius_m: radiusM, p_limit: limit }),
  ) as HazardSummary[] | null;
  return data ?? [];
}

export async function hazardsInBBox(box: BBox, categories?: HazardCategory[] | null, limit = 1000): Promise<HazardSummary[]> {
  const data = unwrap(
    await supabase.rpc('hazards_in_bbox', {
      p_min_lat: box.minLat,
      p_min_lng: box.minLng,
      p_max_lat: box.maxLat,
      p_max_lng: box.maxLng,
      p_categories: categories && categories.length ? categories : null,
      p_limit: limit,
    }),
  ) as HazardSummary[] | null;
  return data ?? [];
}

export async function getHazard(id: string): Promise<Hazard | null> {
  const res = await supabase.from('hazards').select(HAZARD_COLUMNS).eq('id', id).maybeSingle();
  return unwrap(res) as Hazard | null;
}

export async function getTimeline(hazardId: string): Promise<StatusEvent[]> {
  const res = await supabase
    .from('status_history')
    .select('id, hazard_id, from_status, to_status, note, created_at')
    .eq('hazard_id', hazardId)
    .order('created_at', { ascending: true });
  return (unwrap(res) as StatusEvent[] | null) ?? [];
}

export async function getHazardImages(hazardId: string): Promise<HazardImage[]> {
  const res = await supabase
    .from('hazard_images')
    .select('id, hazard_id, task_id, uploader_id, storage_path, kind, privacy_blurred, privacy_approved, width, height, created_at')
    .eq('hazard_id', hazardId)
    .order('created_at', { ascending: true });
  return (unwrap(res) as HazardImage[] | null) ?? [];
}

export async function getAiDetection(id: string): Promise<AiDetectionRow | null> {
  const res = await supabase
    .from('ai_detections')
    .select('id, model_name, model_version, top_category, top_confidence, detections, user_accepted_category')
    .eq('id', id)
    .maybeSingle();
  return unwrap(res) as AiDetectionRow | null;
}

export async function myConfirmation(hazardId: string, userId: string): Promise<{ still_present: boolean } | null> {
  const res = await supabase
    .from('hazard_confirmations')
    .select('still_present')
    .eq('hazard_id', hazardId)
    .eq('user_id', userId)
    .maybeSingle();
  return unwrap(res) as { still_present: boolean } | null;
}

export async function confirmHazard(hazardId: string, stillPresent: boolean) {
  return unwrap(await supabase.rpc('confirm_hazard', { p_hazard_id: hazardId, p_still_present: stillPresent })) as {
    confirmations_count: number;
  };
}

export async function requestReopen(hazardId: string, note: string) {
  return unwrap(await supabase.rpc('request_reopen', { p_hazard_id: hazardId, p_note: note || null }));
}

export type MyReport = HazardSummary & { description: string; updated_at: string };

export async function myReports(userId: string): Promise<MyReport[]> {
  const res = await supabase
    .from('hazards')
    .select('id, public_code, category, severity, status, latitude, longitude, address, city, confirmations_count, created_at, verified_at, updated_at, description, priority')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  return (unwrap(res) as MyReport[] | null) ?? [];
}

export async function myStats(): Promise<MyStats> {
  return unwrap(await supabase.rpc('my_report_stats')) as MyStats;
}

export async function myActivity(limit = 10): Promise<ActivityItem[]> {
  return ((unwrap(await supabase.rpc('my_activity', { p_limit: limit })) as ActivityItem[] | null) ?? []);
}

export type DuplicateCandidate = {
  id: string;
  public_code: string;
  category: HazardCategory;
  severity: HazardSeverity;
  status: HazardSummary['status'];
  latitude: number;
  longitude: number;
  created_at: string;
  distance_m: number;
  same_category: boolean;
  is_mine: boolean;
};

export async function findDuplicates(lat: number, lng: number, category: HazardCategory | null, radiusM = 50) {
  return ((unwrap(
    await supabase.rpc('find_possible_duplicates', {
      p_lat: lat,
      p_lng: lng,
      p_category: category,
      p_radius_m: radiusM,
    }),
  ) as DuplicateCandidate[] | null) ?? []);
}

/** First photo of each of the user's reports, as short-lived signed URLs (RLS: own uploads). */
export async function myReportCovers(hazardIds: string[]): Promise<Record<string, string>> {
  if (hazardIds.length === 0) return {};
  const res = await supabase.from('hazard_images').select('hazard_id, storage_path, created_at')
    .in('hazard_id', hazardIds).eq('kind', 'report').order('created_at', { ascending: true });
  const rows = (unwrap(res) as { hazard_id: string; storage_path: string }[] | null) ?? [];
  const first = new Map<string, string>();
  for (const r of rows) if (!first.has(r.hazard_id)) first.set(r.hazard_id, r.storage_path);
  if (first.size === 0) return {};
  const { signedUrls } = await import('./storage');
  const { HAZARD_BUCKET } = await import('../supabase');
  const urls = await signedUrls(HAZARD_BUCKET, [...first.values()]).catch(() => ({}) as Record<string, string>);
  const out: Record<string, string> = {};
  for (const [id, path] of first) if (urls[path]) out[id] = urls[path]!;
  return out;
}
