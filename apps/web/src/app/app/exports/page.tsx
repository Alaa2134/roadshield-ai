import { Download, FileSpreadsheet } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Reports & Exports' };

export default async function Exports() {
  const { org } = await requireOrg();
  const { p, t } = await getAppDict();
  const items = Object.entries(p.exports.items).filter(([k]) => k !== 'audit' || org.role === 'owner');
  return (
    <>
      <PageHeader title={p.exports.title} subtitle={p.exports.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([k, label]) => (
          <a key={k} href={`/api/export/${k}`} className="card card-pad group flex items-center gap-4 transition-shadow hover:shadow-card" download>
            <span className="grid size-11 place-items-center rounded-xl bg-teal-soft text-teal-text"><FileSpreadsheet size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block font-[580]">{label}</span><span className="text-xs text-ink-2">CSV · UTF-8</span></span>
            <Download size={17} className="text-ink-3 group-hover:text-accent" aria-label={t.common.export} />
          </a>
        ))}
      </div>
    </>
  );
}
