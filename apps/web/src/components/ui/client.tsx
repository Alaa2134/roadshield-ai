'use client';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Moon, Sun, Monitor, AlertTriangle, WifiOff } from 'lucide-react';
import clsx from 'clsx';

export type ActionResult = { ok: boolean; error?: string; message?: string; redirect?: string } | null;
type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Form wired to a Server Action with pending state, error and success feedback. */
export function ActionForm({ action, children, className, success, resetOnSuccess = false, errors, testId }: {
  action: Action; children: ReactNode; className?: string; success?: string; resetOnSuccess?: boolean;
  errors: Record<string, string>; testId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state?.ok && state.redirect) router.push(state.redirect);
  }, [state, resetOnSuccess, router]);
  const msg = state?.error ? errors[state.error] ?? errors.generic ?? state.error : null;
  return (
    <form ref={ref} action={formAction} className={className} data-testid={testId} noValidate={false}>
      {children}
      <div aria-live="polite" className="empty:hidden">
        {msg ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-crit-soft px-3 py-2 text-[13px] text-crit-text" role="alert" data-testid="form-error">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{msg}
          </p>
        ) : state?.ok && (state.message || success) ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok-text" data-testid="form-success">
            <CheckCircle2 size={15} />{state.message ?? success}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function SubmitButton({ children, variant = 'primary', size, className, name, value, testId }: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'lg'; className?: string; name?: string; value?: string; testId?: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = !name || data?.get(name) === value;
  return (
    <button type="submit" name={name} value={value} disabled={pending} data-testid={testId}
      className={clsx('btn', `btn-${variant}`, size && `btn-${size}`, className)}>
      {pending && mine ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeSwitcher({ initial, labels }: { initial: 'light' | 'dark' | 'system'; labels: { light: string; dark: string; system: string } }) {
  const [theme, setTheme] = useState(initial);
  const apply = (t: typeof theme) => {
    setTheme(t);
    setCookie('rs_theme', t);
    const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  const opts = [
    { k: 'light' as const, icon: Sun, label: labels.light },
    { k: 'dark' as const, icon: Moon, label: labels.dark },
    { k: 'system' as const, icon: Monitor, label: labels.system },
  ];
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5" role="radiogroup">
      {opts.map((o) => (
        <button key={o.k} type="button" role="radio" aria-checked={theme === o.k} aria-label={o.label} title={o.label}
          onClick={() => apply(o.k)}
          className={clsx('grid h-7 w-8 place-items-center rounded-md transition-colors', theme === o.k ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink')}>
          <o.icon size={14} />
        </button>
      ))}
    </div>
  );
}

export function LanguageSwitcher({ locale, compact = false, dark = false }: { locale: 'en' | 'ar'; compact?: boolean; dark?: boolean }) {
  const router = useRouter();
  const next = locale === 'en' ? 'ar' : 'en';
  return (
    <button type="button" data-testid="lang-switch"
      onClick={() => { setCookie('rs_locale', next); router.refresh(); }}
      className={clsx('btn btn-sm', dark ? 'btn-on-dark' : 'btn-ghost', compact && 'px-2')}
      aria-label={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}>
      <span className={next === 'ar' ? 'font-arabic' : ''}>{next === 'ar' ? 'العربية' : 'English'}</span>
    </button>
  );
}

export function OfflineBanner({ text }: { text: string }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(false); const off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-xs font-[560] text-navy" role="status">
      <WifiOff size={13} /> {text}
    </div>
  );
}
