import type * as GeoJSON from 'geojson';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { NetworkMap } from '@/components/app/maps';

export const metadata = { title: 'Interactive Map' };

export default async function MapPage() {
  const { org } = await requireOrg();
  const { t, p } = await getAppDict();
  const sb = await supabaseServer();
  const [roads, defects] = await Promise.all([sb.rpc('roads_geojson', { p_org: org.org_id }), sb.rpc('defects_geojson', { p_org: org.org_id })]);
  const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;
  return (
    <>
      <PageHeader title={p.map.title} subtitle={p.map.tilesNote} />
      <NetworkMap roads={(roads.data as GeoJSON.FeatureCollection) ?? empty} defects={(defects.data as GeoJSON.FeatureCollection) ?? empty}
        center={[31.67, 31.44]}
        labels={{ ...p.map, conditions: t.condition, km: t.common.km, inspections: p.inspections.title.split(' ')[0] ?? 'Inspections', defectsCount: p.inspections.defects, hazards: p.reports.title }} />
    </>
  );
}
