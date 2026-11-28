'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export function MobileMenu({ links, dark }: { links: { href: string; label: string }[]; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <>
      <button type="button" className={`btn btn-sm lg:hidden ${dark ? 'btn-on-dark' : 'btn-secondary'} px-2`} aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu size={18} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 end-0 flex w-[min(86vw,360px)] flex-col bg-navy p-5 shadow-float fade-up">
            <div className="mb-6 flex justify-end">
              <button type="button" className="btn btn-sm btn-on-dark px-2" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="rounded-xl px-3 py-3 text-[15px] font-[540] text-[#D5DEEA] hover:bg-white/6">{l.label}</Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
