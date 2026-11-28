import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCallbackDestination } from '../../src/lib/auth-redirect.ts';

test('email auth callback keeps supported local destinations', () => {
  for (const path of ['/app', '/app/onboarding', '/reset-password']) {
    assert.equal(authCallbackDestination(path), path);
  }
});
test('email auth callback rejects external or unexpected destinations', () => {
  for (const path of [null, '', 'https://example.org', '//example.org', '/\\example.org', '/app/../reset-password', '/sign-in', '/app?next=https://example.org']) {
    assert.equal(authCallbackDestination(path), '/app');
  }
});
