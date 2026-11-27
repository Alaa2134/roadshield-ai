import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, num, pct } from '../../src/lib/format.ts';

test('money shows ISO currency code and two decimals', () => {
  const n = (s: string) => s.replace(/\u00a0/g, ' ');
  assert.equal(n(money(1234.5, 'EGP', 'en')), 'EGP 1,234.50');
  assert.equal(money(null, 'EGP', 'en'), '—');
  assert.equal(n(money('29276.66', 'USD', 'en')), 'USD 29,276.66');
});
test('Arabic locale uses Latin digits', () => {
  assert.equal(num(1234.5, 'ar', 1), '1,234.5'); // Latin digits in the Arabic UI
});
test('percent formatting', () => {
  assert.equal(pct(12.345, 'en'), '12.3%');
  assert.equal(pct(null, 'en'), '—');
});
