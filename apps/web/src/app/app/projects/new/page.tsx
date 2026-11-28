import { redirect } from 'next/navigation';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { Card, Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';
import { RoadPicker } from '@/components/app/RoadPicker';

export const metadata = { title: 'New project' };

export default async function NewProject({ searchParams }: { searchParams: Promise<{ road?: string }> }) {
  const { org } = await requireOrg();
  if (!can.engineer(org.role)) redirect('/app/projects');
  const { t, p } = await getAppDict();
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: pre } = sp.road ? await sb.from('road_segments').select('id, name, highway_class, length_m').eq('id', sp.road) : { data: [] };
  const year = new Date().getFullYear();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={p.projects.new} subtitle={p.projects.subtitle} />
      <Card>
        <RpcForm rpc="create_project" t={t} hidden={{ p_org: org.org_id }} redirect="/app/projects/{id}" revalidate="/app/projects" className="space-y-4" testId="new-project">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <Field label={t.common.code} name="p_code" required><input id="p_code" name="p_code" className="input font-mono uppercase" required defaultValue={`P-${year}-`} maxLength={40} /></Field>
            <Field label={t.common.name} name="p_name" required><input id="p_name" name="p_name" className="input" required minLength={3} maxLength={200} /></Field>
          </div>
          <Field label={t.common.description} name="p_description"><textarea id="p_description" name="p_description" className="textarea" rows={3} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={p.projects.priority} name="p_priority">
              <select id="p_priority" name="p_priority" className="select" defaultValue="3">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>P{n}</option>)}</select>
            </Field>
            <Field label={p.projects.repairMethod} name="p_repair_method"><input id="p_repair_method" name="p_repair_method" className="input" placeholder="mill_and_overlay" list="methods" />
              <datalist id="methods"><option value="mill_and_overlay" /><option value="patching" /><option value="crack_sealing" /><option value="full_depth_reconstruction" /><option value="surface_treatment" /></datalist></Field>
            <Field label={`${p.projects.area} (m²)`} name="p_verified_damaged_area_m2" hint={t.common.optional}><input id="p_verified_damaged_area_m2" name="p_verified_damaged_area_m2" className="input" inputMode="decimal" /></Field>
            <Field label={p.projects.start} name="p_planned_start"><input id="p_planned_start" name="p_planned_start" type="date" className="input" /></Field>
            <Field label={p.projects.end} name="p_planned_end"><input id="p_planned_end" name="p_planned_end" type="date" className="input" /></Field>
          </div>
          <RoadPicker orgId={org.org_id} label={p.projects.selectRoads} placeholder={p.roads.searchPlaceholder} initial={(pre ?? []) as { id: string; name: string | null; highway_class: string; length_m: number }[]} />
          <div className="flex justify-end"><SubmitButton testId="new-project-submit">{t.common.create}</SubmitButton></div>
        </RpcForm>
      </Card>
    </div>
  );
}
