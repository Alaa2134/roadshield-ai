'use client';
import { useState } from 'react';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { runRpc } from '@/lib/actions/rpc';
import type { Dict } from '@/lib/i18n/dict';

export function OrgSettingsForm({ org, t, labels }: { org: Record<string, string | boolean | null>; t: Dict; labels: Record<string, string> }) {
  const [v, setV] = useState({ name: String(org.name ?? ''), name_ar: String(org.name_ar ?? ''), city: String(org.city ?? ''), region: String(org.region ?? ''),
    timezone: String(org.timezone ?? 'UTC'), engineering_standard: String(org.engineering_standard ?? ''), four_eyes_approval: org.four_eyes_approval !== false });
  const field = (k: keyof typeof v, label: string, dir?: 'rtl') => (
    <label className="block"><span className="mb-1.5 block text-[13px] font-[560]">{label}</span>
      <input className="input" dir={dir} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  );
  return (
    <ActionForm action={runRpc} errors={t.errors} success={t.common.saved} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="_rpc" value="update_organization" />
      <input type="hidden" name="p_org" value={String(org.id)} />
      <input type="hidden" name="p_patch" value={JSON.stringify(v)} />
      <input type="hidden" name="_revalidate" value="/app/organization" />
      {field('name', labels.name!)}{field('name_ar', labels.nameAr!, 'rtl')}{field('city', labels.city!)}{field('region', labels.region!)}{field('timezone', labels.timezone!)}{field('engineering_standard', labels.standard!)}
      <label className="flex items-center gap-2.5 text-sm sm:col-span-2"><input type="checkbox" checked={v.four_eyes_approval} onChange={(e) => setV({ ...v, four_eyes_approval: e.target.checked })} />{labels.fourEyes}</label>
      <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">{t.common.save}</SubmitButton></div>
    </ActionForm>
  );
}
