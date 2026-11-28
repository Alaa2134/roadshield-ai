import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export { clsx as cx };

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
        <h1 className="t-page text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ children, className, pad = true, as: As = 'section' }: { children: ReactNode; className?: string; pad?: boolean; as?: 'section' | 'div' | 'article' }) {
  return <As className={clsx('card', pad && 'card-pad', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text"><Icon size={15} strokeWidth={2} /></span> : null}
        <div className="min-w-0">
          <h2 className="t-card text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type Tone = 'neutral' | 'blue' | 'teal' | 'green' | 'amber' | 'red' | 'violet';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  blue: 'bg-accent-soft text-accent-text',
  teal: 'bg-teal-soft text-teal-text',
  green: 'bg-ok-soft text-ok-text',
  amber: 'bg-warn-soft text-warn-text',
  red: 'bg-crit-soft text-crit-text',
  violet: 'bg-[rgba(124,92,255,0.12)] text-[#6d4fe0] dark:text-[#b4a3ff]',
};
export function Badge({ children, tone = 'neutral', dot = false, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return <span className={clsx('badge', dot && 'badge-dot', toneClass[tone], className)}>{children}</span>;
}

export const conditionTone = (c: string): Tone =>
  ({ good: 'green', fair: 'teal', poor: 'amber', critical: 'red' } as Record<string, Tone>)[c] ?? 'neutral';
export const approvalTone = (s: string): Tone =>
  ({ approved: 'green', submitted: 'amber', rejected: 'red' } as Record<string, Tone>)[s] ?? 'neutral';
export const projectTone = (s: string): Tone =>
  ({ planning: 'neutral', approved: 'blue', in_progress: 'teal', completed: 'green', closed: 'green', cancelled: 'red' } as Record<string, Tone>)[s] ?? 'neutral';
export const woTone = (s: string): Tone =>
  ({ draft: 'neutral', issued: 'blue', in_progress: 'teal', submitted: 'amber', accepted: 'green', rejected: 'red', cancelled: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
export const severityTone = (s: string): Tone =>
  ({ low: 'neutral', medium: 'amber', high: 'red', critical: 'red' } as Record<string, Tone>)[s] ?? 'neutral';

export const conditionColor: Record<string, string> = {
  unknown: '#8D99AB', good: '#12A879', fair: '#00B8A9', poor: '#F5A524', critical: '#E5484D',
};

export function Kpi({ label, value, hint, icon: Icon, tone = 'blue', footer, testId }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; footer?: ReactNode; testId?: string;
}) {
  return (
    <div className="card flex min-w-0 flex-col p-4 sm:p-5" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <span className="t-label line-clamp-2 leading-snug">{label}</span>
        {Icon ? <span className={clsx('grid size-7 place-items-center rounded-lg', toneClass[tone])}><Icon size={15} strokeWidth={2} /></span> : null}
      </div>
      <div className="t-metric mt-3 overflow-hidden text-ellipsis whitespace-nowrap text-ink" title={typeof value === 'string' ? value : undefined}>{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-ink-2">{hint}</div> : null}
      {footer ? <div className="mt-3 border-t border-line pt-3 text-xs text-ink-2">{footer}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, compact = false }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      {Icon ? (
        <div className="relative mb-4">
          <div className="absolute inset-0 -m-3 rounded-full bg-accent-soft opacity-60 blur-md" />
          <span className="relative grid size-12 place-items-center rounded-2xl border border-line bg-surface text-accent-text shadow-soft"><Icon size={22} strokeWidth={1.75} /></span>
        </div>
      ) : null}
      <h3 className="t-card text-ink">{title}</h3>
      {body ? <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ButtonLink({ href, children, variant = 'primary', size, className, icon: Icon, prefetch }: {
  href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'on-dark'; size?: 'sm' | 'lg'; className?: string; icon?: LucideIcon; prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={clsx('btn', `btn-${variant}`, size && `btn-${size}`, className)}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} /> : null}
      {children}
    </Link>
  );
}

export function Field({ label, name, hint, children, required, error }: { label: string; name?: string; hint?: string; children: ReactNode; required?: boolean; error?: string }) {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-[560] text-ink">
        {label}
        {required ? <span className="text-crit" aria-hidden>*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-crit-text">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Progress({ value, tone = 'blue', label }: { value: number; tone?: 'blue' | 'teal' | 'amber' | 'red' | 'green'; label?: string }) {
  const color = { blue: 'bg-accent', teal: 'bg-teal', amber: 'bg-warn', red: 'bg-crit', green: 'bg-ok' }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Tabs">
      {items.map((it) => (
        <Link key={it.key} href={it.href} scroll={false}
          className={clsx('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-[560] transition-colors',
            it.key === active ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
          aria-current={it.key === active ? 'page' : undefined}>
          {it.label}
          {it.count !== undefined ? <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[11px] text-ink-2 tabular">{it.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function TableCard({ children, title, subtitle, action, footer }: { children: ReactNode; title?: string; subtitle?: string; action?: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="t-card">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="overflow-x-auto">{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3 text-xs text-ink-2">{footer}</div> : null}
    </section>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="t-label">{it.label}</dt>
          <dd className={clsx('mt-0.5 truncate text-sm text-ink', it.mono && 'font-mono text-[13px]')}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'blue', title, children, icon: Icon }: { tone?: 'blue' | 'amber' | 'red' | 'green'; title?: string; children: ReactNode; icon?: LucideIcon }) {
  const cls = { blue: 'border-accent/25 bg-accent-soft text-accent-text', amber: 'border-warn/30 bg-warn-soft text-warn-text', red: 'border-crit/30 bg-crit-soft text-crit-text', green: 'border-ok/30 bg-ok-soft text-ok-text' }[tone];
  return (
    <div className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', cls)} role="note">
      {Icon ? <Icon size={16} className="mt-0.5 shrink-0" /> : null}
      <div className="min-w-0">
        {title ? <p className="font-[600]">{title}</p> : null}
        <div className={clsx(title && 'mt-0.5', 'leading-relaxed opacity-95')}>{children}</div>
      </div>
    </div>
  );
}
