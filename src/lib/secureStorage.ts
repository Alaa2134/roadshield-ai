import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the iOS Keychain / Android Keystore.
 *
 * SecureStore values are limited in size on some platforms, and a Supabase session can be
 * larger than that, so values are split into chunks under `${key}.${n}` with a chunk count
 * stored under `${key}.n`. Keys are sanitised to SecureStore's allowed character set.
 */
const CHUNK = 1800;
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safe(key);
    const countRaw = await SecureStore.getItemAsync(`${base}.n`);
    if (!countRaw) return null;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1 || count > 64) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safe(key);
    const previous = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? 0);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK));
    if (chunks.length === 0) chunks.push('');
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${base}.${i}`, chunks[i] ?? '');
    }
    await SecureStore.setItemAsync(`${base}.n`, String(chunks.length));
    for (let i = chunks.length; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${base}.${i}`);
    }
  },

  async removeItem(key: string): Promise<void> {
    const base = safe(key);
    const count = Number((await SecureStore.getItemAsync(`${base}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${base}.${i}`);
    await SecureStore.deleteItemAsync(`${base}.n`);
  },
};
