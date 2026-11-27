'use server';
import { supabaseServer } from '@/lib/supabase/server';

/** Road summary for the map side panel; RLS limits it to the caller's organizations. */
export async function getRoadSummary(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('road_detail', { p_road: id });
  if (!data) return null;
  const d = data as { road: Record<string, unknown>; inspections: unknown[]; defects: unknown[]; projects: { code: string; name: string; status: string }[]; citizen_hazards: unknown[] };
  return {
    road: d.road, inspections: d.inspections.length, defects: d.defects.length, hazards: d.citizen_hazards.length,
    projects: d.projects.slice(0, 3),
  };
}
