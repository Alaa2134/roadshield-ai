'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, Route, Map, ScanLine, TriangleAlert, Box, FolderKanban, ClipboardList, HardHat, Wallet, FileText, TrendingUp,
  SlidersHorizontal, Activity, BarChart3, Download, Cpu, Building2, Users, Settings, Menu, X , ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import type { NavGroup } from './nav';

const ICONS = { layout: LayoutDashboard, route: Route, map: Map, scan: ScanLine, alert: TriangleAlert, box: Box, folder: FolderKanban,
  clipboard: ClipboardList, hardhat: HardHat, wallet: Wallet, file: FileText, trending: TrendingUp, sliders: SlidersHorizontal,
  activity: Activity, chart: BarChart3, download: Download, cpu: Cpu, building: Building2, users: Users, settings: Settings, shield: ShieldCheck };

export function Sidebar({ groups, labels, groupLabels, orgName, planLabel }: {
  groups: NavGroup[]; labels: Record<string, string>; groupLabels: Record<string, string>; orgName: string; planLabel: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string) => (href === '/app' ? path === '/app' : path === href || path.startsWith(href + '/'));
  // The most specific matching item wins (e.g. Organization vs. User Management).
  const best = groups.flatMap((g) => g.items).filter((i) => isActive(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Link href="/app"><Logo dark size={28} /></Link></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Application">
        {groups.map((g) => (
          <div key={g.key} className="mt-4 first:mt-1">
            <p className="px-3 pb-1.5 text-[10.5px] font-[600] uppercase tracking-[0.1em] text-[#5E7089] rtl:tracking-normal">{groupLabels[g.key]}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = ICONS[it.icon as keyof typeof ICONS] ?? LayoutDashboard;
                const active = it.href === best;
                return (
                  <li key={it.href}>
                    <Link href={it.href} aria-current={active ? 'page' : undefined}
                      className={clsx('group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-[520] transition-colors',
                        active ? 'bg-[var(--rs-sidebar-active)] text-white' : 'text-[var(--rs-sidebar-text)] hover:bg-white/5 hover:text-white')}>
                      <Icon size={16} strokeWidth={1.9} className={active ? 'text-cyan' : 'text-[#6F82A0] group-hover:text-[#C3CFDF]'} />
                      <span className="truncate">{labels[it.key]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <p className="truncate text-[13px] font-[580] text-white">{orgName}</p>
        <p className="mt-0.5 text-[11px] text-[#7F8EA5]">{planLabel}</p>
      </div>
    </div>
  );
  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[248px] bg-[var(--rs-sidebar)] lg:block">{body}</aside>
      <button type="button" className="btn btn-sm btn-secondary fixed start-3 top-3.5 z-30 px-2 lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)} data-testid="nav-open"><Menu size={18} /></button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-[min(84vw,280px)] bg-[var(--rs-sidebar)] shadow-float">
            <button type="button" className="btn btn-sm btn-on-dark absolute end-3 top-4 px-2" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={16} /></button>
            {body}
          </aside>
        </div>
      ) : null}
    </>
  );
}
