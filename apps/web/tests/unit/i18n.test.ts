import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en, ar } from '../../src/lib/i18n/dict.ts';
import { pages } from '../../src/lib/i18n/pages.ts';
import { marketing } from '../../src/lib/i18n/marketing.ts';
import { homeCopy } from '../../src/lib/i18n/home.ts';

function keys(o: unknown, pre = ''): string[] {
  if (o === null || typeof o !== 'object') return [pre];
  if (Array.isArray(o)) return [`${pre}[${o.length}]`, ...o.flatMap((v, i) => keys(v, `${pre}[${i}]`))];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, pre ? `${pre}.${k}` : k));
}
const same = (a: unknown, b: unknown) => assert.deepEqual(keys(a).sort(), keys(b).sort());

test('app dictionary: Arabic mirrors every English key', () => same(en, ar));
test('page dictionary: Arabic mirrors every English key', () => same(pages.en, pages.ar));
test('marketing copy: Arabic mirrors every English key and list length', () => same(marketing.en, marketing.ar));

test('homepage copy: Arabic mirrors every English key and list length', () => same(homeCopy.en, homeCopy.ar));

test('no empty translations', () => {
  const walk = (o: unknown, path: string) => {
    if (typeof o === 'string') assert.ok(o.trim().length > 0, `empty string at ${path}`);
    else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => walk(v, `${path}.${k}`));
  };
  walk(ar, 'ar'); walk(pages.ar, 'pages.ar'); walk(marketing.ar, 'marketing.ar'); walk(homeCopy.ar, 'home.ar');
});

test('marketing copy makes no invented claims (no %, certifications or customer counts)', () => {
  const text = JSON.stringify([marketing.en, homeCopy.en]);
  assert.ok(!/\b\d+\s?%/.test(text), 'percent statistic found');
  assert.ok(!/SOC 2 (certified|compliant)|ISO 27001 certified/i.test(text));
  assert.ok(!/trusted by|customers worldwide|cities use/i.test(text));
});
