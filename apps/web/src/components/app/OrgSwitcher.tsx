'use client';
import { useTransition } from 'react';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { switchOrg } from '@/lib/actions/rpc';

export function OrgSwitcher({ orgs, current, label, addLabel }: { orgs: { id: string; name: string; country: string; role: string }[]; current: string; label: string; addLabel: string }) {
  const [pending, start] = useTransition();
  const cur = orgs.find((o) => o.id === current);
  return (
    <details className="group relative min-w-0 shrink">
      <summary className="flex h-9 min-w-0 cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-[560] shadow-soft hover:bg-hover [&::-webkit-details-marker]:hidden" aria-label={label}>
        <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-brand to-teal text-[10px] font-[700] text-white">{cur?.name.slice(0, 1).toUpperCase()}</span>
        <span className="max-w-[7.5rem] truncate sm:max-w-40">{cur?.name}</span>
        <span className="hidden rounded bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-2 sm:inline">{cur?.country}</span>
        <ChevronsUpDown size={14} className="text-ink-3" />
      </summary>
      <div className="absolute start-0 z-40 mt-2 w-72 rounded-xl border border-line bg-raised p-1.5 shadow-float">
        <p className="px-2.5 py-1.5 text-[11px] font-[600] text-ink-3">{label}</p>
        {orgs.map((o) => (
          <button key={o.id} type="button" disabled={pending} onClick={() => start(() => switchOrg(o.id))}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] hover:bg-hover">
            <span className="grid size-6 place-items-center rounded-md bg-sunken text-[11px] font-[650]">{o.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-[560]">{o.name}</span><span className="block truncate text-[11px] text-ink-2">{o.role} · {o.country}</span></span>
            {o.id === current ? <Check size={15} className="text-accent" /> : null}
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        <Link href="/app/onboarding" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"><Plus size={15} />{addLabel}</Link>
      </div>
    </details>
  );
}
