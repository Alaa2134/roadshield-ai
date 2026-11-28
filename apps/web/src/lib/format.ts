import type { Locale } from './i18n/dict';

// Arabic UI uses Latin digits (common in Egyptian business software; Arabic-Indic ٠ reads as a dot).
const tag = (l: Locale) => (l === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

/** Display-only money formatting. All arithmetic happens in Postgres numeric. */
export function money(value: number | string | null | undefined, currency: string, locale: Locale, opts: { compact?: boolean } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(tag(locale), {
    style: 'currency', currency, currencyDisplay: 'code',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 2, minimumFractionDigits: opts.compact ? 0 : 2,
  }).format(n);
}

export function num(value: number | string | null | undefined, locale: Locale, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function pct(value: number | null | undefined, locale: Locale, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: digits }).format(value / 100);
}

export function date(value: string | Date | null | undefined, locale: Locale, withTime = false) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), withTime
    ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(d);
}

export function relative(value: string | Date, locale: Locale) {
  const d = typeof value === 'string' ? new Date(value) : value;
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return date(d, locale);
}

export const km = (meters: number | string | null | undefined) =>
  meters === null || meters === undefined ? null : Number(meters) / 1000;
