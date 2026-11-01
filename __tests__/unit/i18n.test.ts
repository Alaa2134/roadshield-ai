import ar from '@/lib/i18n/ar';
import en from '@/lib/i18n/en';
import { HAZARD_CATEGORIES, SEVERITIES, type ReportStatus } from '@/lib/types';

const REPORT_STATUSES: ReportStatus[] = [
  'submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'duplicate', 'reopened',
];
// Brand names stay in Latin script in both languages.
const BRAND_KEYS = new Set(['common.appName']);

type Tree = { [k: string]: string | Tree };
function flatten(obj: Tree, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}
const E = flatten(en as unknown as Tree);
const A = flatten(ar as unknown as Tree);
const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((v) => v.replace(/\s/g, '')).sort();

describe('translations', () => {
  it('Arabic and English have exactly the same keys', () => {
    expect(Object.keys(A).filter((k) => !(k in E))).toEqual([]);
    expect(Object.keys(E).filter((k) => !(k in A))).toEqual([]);
  });
  it('no translation is empty', () => {
    expect(Object.entries(A).filter(([, v]) => !v.trim())).toEqual([]);
    expect(Object.entries(E).filter(([, v]) => !v.trim())).toEqual([]);
  });
  it('interpolation variables match between languages', () => {
    const mismatched = Object.keys(E).filter((k) => JSON.stringify(vars(E[k]!)) !== JSON.stringify(vars(A[k]!)));
    expect(mismatched).toEqual([]);
  });
  it('Arabic strings are actually Arabic', () => {
    const latinOnly = Object.entries(A).filter(([k, v]) => !BRAND_KEYS.has(k) && /[A-Za-z]{4,}/.test(v.replace(/{{\s*\w+\s*}}/g, '')) && !/[؀-ۿ]/.test(v));
    expect(latinOnly.map(([k]) => k)).toEqual([]);
  });
  it('every category, severity and status is translated', () => {
    for (const c of HAZARD_CATEGORIES) expect(A[`categories.${c}`] && E[`categories.${c}`]).toBeTruthy();
    for (const s of SEVERITIES) expect(A[`severity.${s}`] && E[`severity.${s}`]).toBeTruthy();
    for (const s of REPORT_STATUSES) expect(A[`status.${s}`] && E[`status.${s}`]).toBeTruthy();
  });
  it('includes the honest AI fallback message', () => {
    expect(Object.values(E)).toContain('AI analysis unavailable — continue manually.');
  });
});
