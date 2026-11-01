/**
 * Authentication & permission behaviour on the client:
 *  - session lifecycle (sign-in loads the role from the database, sign-out resets it,
 *    password-recovery links are detected),
 *  - role-based route guards for the officer and admin areas,
 *  - the encrypted (Keychain/Keystore) session storage adapter.
 * The server re-checks every role on each RPC; those checks are covered by
 * supabase/tests/database_security_tests.sql.
 */
import { render, screen } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

let mockAuthCallback: ((event: string, session: Session | null) => void) | null = null;
const mockSession = { user: { id: 'u-1' }, access_token: 't' } as unknown as Session;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession } })),
      onAuthStateChange: jest.fn((cb: typeof mockAuthCallback) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
  },
}));
jest.mock('@/lib/api/profile', () => ({
  fetchProfile: jest.fn(async () => ({ profile: { id: 'u-1', full_name: 'Officer Mona' }, role: 'maintenance_officer' })),
}));
jest.mock('@/theme/ThemeProvider', () => ({ useTheme: () => ({ p: { bg: '#070F1E' } }) }));
jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    Redirect: ({ href }: { href: string }) => R.createElement(T, null, `redirect:${href}`),
    Stack: () => R.createElement(T, null, 'protected-area'),
  };
});

// eslint-disable-next-line import/first
import AdminLayout from '@/app/admin/_layout';
// eslint-disable-next-line import/first
import OfficerLayout from '@/app/officer/_layout';
// eslint-disable-next-line import/first
import { chunkedSecureStorage } from '@/lib/secureStorage';
// eslint-disable-next-line import/first
import { isStaff, startSessionListener, useSession } from '@/stores/session';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('session lifecycle', () => {
  it('restores the stored session and loads the role from the server', async () => {
    startSessionListener();
    await flush();
    await flush();
    expect(useSession.getState()).toMatchObject({ ready: true, role: 'maintenance_officer' });
    expect(useSession.getState().session?.user.id).toBe('u-1');
  });

  it('detects password-recovery deep links', () => {
    mockAuthCallback!('PASSWORD_RECOVERY', mockSession);
    expect(useSession.getState().recovering).toBe(true);
  });

  it('signing out clears the profile and drops back to citizen permissions', () => {
    mockAuthCallback!('SIGNED_OUT', null);
    expect(useSession.getState()).toMatchObject({ session: null, profile: null, role: 'citizen', recovering: false });
  });

  it('only officers and admins count as staff', () => {
    expect(isStaff('citizen')).toBe(false);
    expect(isStaff('maintenance_officer')).toBe(true);
    expect(isStaff('admin')).toBe(true);
  });
});

describe('role-based route guards', () => {
  const as = (role: 'citizen' | 'maintenance_officer' | 'admin' | null) =>
    useSession.setState({ session: role ? mockSession : null, role: role ?? 'citizen' });

  it.each([
    [null, 'redirect:/(auth)/sign-in', 'redirect:/(auth)/sign-in'],
    ['citizen', 'redirect:/(tabs)', 'redirect:/(tabs)'],
    ['maintenance_officer', 'redirect:/(tabs)', 'protected-area'],
    ['admin', 'protected-area', 'protected-area'],
  ] as const)('%s → admin: %s, officer: %s', async (role, adminResult, officerResult) => {
    as(role);
    await render(<AdminLayout />);
    expect(screen.getByText(adminResult)).toBeTruthy();
    await render(<OfficerLayout />);
    expect(screen.getByText(officerResult)).toBeTruthy();
  });
});

describe('secure session storage', () => {
  it('round-trips a large session through Keychain-sized chunks', async () => {
    const big = JSON.stringify({ access_token: 'x'.repeat(5000), refresh_token: 'r' });
    await chunkedSecureStorage.setItem('sb-ref-auth-token', big);
    expect(await chunkedSecureStorage.getItem('sb-ref-auth-token')).toBe(big);
    const writes = (SecureStore.setItemAsync as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(writes.every((k) => /^[A-Za-z0-9._-]+$/.test(k))).toBe(true);
    expect(writes).toContain('sb-ref-auth-token.n');
  });

  it('shrinking a value removes stale chunks, and removeItem deletes everything', async () => {
    await chunkedSecureStorage.setItem('k', 'a'.repeat(4000));
    await chunkedSecureStorage.setItem('k', 'short');
    expect(await chunkedSecureStorage.getItem('k')).toBe('short');
    expect(await SecureStore.getItemAsync('k.2')).toBeNull();
    await chunkedSecureStorage.removeItem('k');
    expect(await chunkedSecureStorage.getItem('k')).toBeNull();
  });

  it('a missing chunk is treated as no session rather than a corrupted one', async () => {
    await chunkedSecureStorage.setItem('k2', 'b'.repeat(4000));
    await SecureStore.deleteItemAsync('k2.1');
    expect(await chunkedSecureStorage.getItem('k2')).toBeNull();
  });
});
