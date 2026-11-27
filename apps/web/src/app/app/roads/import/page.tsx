import { redirect } from 'next/navigation';
import { Terminal } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { Card, Notice, PageHeader } from '@/components/ui';
import { RoadImporter } from '@/components/app/RoadImporter';

export const metadata = { title: 'Import roads' };

export default async function ImportRoads() {
  const { org } = await requireOrg();
  if (!can.engineer(org.role)) redirect('/app/roads');
  const { t, p } = await getAppDict();
  return (
    <div className="max-w-3xl">
      <PageHeader title={p.roads.importTitle} subtitle={p.roads.importBody} />
      <Card><RoadImporter org={org.org_id} labels={p.roads} errors={t.errors} /></Card>
      <div className="mt-4"><Notice tone="blue" icon={Terminal}>{p.roads.importScript}</Notice></div>
    </div>
  );
}
