import i18n from 'i18next';

const locale = () => (i18n.language === 'ar' ? 'ar-EG' : 'en-US');

export function formatNumber(n: number, digits = 0): string {
  try {
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
  } catch {
    return n.toFixed(digits);
  }
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return i18n.t('common.meters', { value: formatNumber(Math.round(meters / 10) * 10) });
  return i18n.t('common.kilometers', { value: formatNumber(meters / 1000, meters < 10_000 ? 1 : 0) });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return new Date(iso).toDateString();
  }
}

/** "5 min ago", "3 days ago" — locale aware. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    for (const [unit, secs] of units) {
      if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
    }
    return rtf.format(Math.round(diff), 'second');
  } catch {
    return formatDateTime(iso);
  }
}

export function hoursLabel(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 48) return i18n.t('common.hours', { value: formatNumber(hours, 1) });
  return `${formatNumber(hours / 24, 1)} ${i18n.language === 'ar' ? 'يوم' : 'd'}`;
}
