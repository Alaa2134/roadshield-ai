import { unwrap } from '../errors';
import { prepareImage } from '../images';
import { AVATAR_BUCKET, supabase } from '../supabase';
import type { AppNotification, Profile, SavedLocation, UserRole } from '../types';
import { signedUrls, uploadJpeg } from './storage';

const PROFILE_COLUMNS =
  'id, full_name, avatar_path, locale, home_city, notify_status_updates, notify_nearby, notify_announcements, nearby_radius_m, suspended_at';

export async function fetchProfile(userId: string): Promise<{ profile: Profile | null; role: UserRole }> {
  const [p, r] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
  ]);
  const profile = unwrap(p) as Profile | null;
  const role = ((unwrap(r) as { role: UserRole } | null)?.role ?? 'citizen') as UserRole;
  return { profile, role };
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'full_name'
    | 'avatar_path'
    | 'locale'
    | 'home_city'
    | 'notify_status_updates'
    | 'notify_nearby'
    | 'notify_announcements'
    | 'nearby_radius_m'
  >
>;

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  const res = await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_COLUMNS).single();
  return unwrap(res) as Profile;
}

export async function uploadAvatar(userId: string, uri: string, w?: number, h?: number): Promise<string> {
  const img = await prepareImage(uri, w, h);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  await uploadJpeg(AVATAR_BUCKET, path, img.uri);
  const { data: old } = await supabase.from('profiles').select('avatar_path').eq('id', userId).maybeSingle();
  await updateProfile(userId, { avatar_path: path });
  const previous = (old as { avatar_path: string | null } | null)?.avatar_path;
  if (previous && previous !== path) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return path;
}

export async function removeAvatar(userId: string, path: string | null) {
  await updateProfile(userId, { avatar_path: null });
  if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

export async function avatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const urls = await signedUrls(AVATAR_BUCKET, [path], 3600);
  return urls[path] ?? null;
}

/* ---------------------------------------------------------------- saved places */
export async function listSavedLocations(): Promise<SavedLocation[]> {
  const res = await supabase
    .from('saved_locations')
    .select('id, label, latitude, longitude, created_at')
    .order('created_at', { ascending: true });
  return (unwrap(res) as SavedLocation[] | null) ?? [];
}

export async function addSavedLocation(userId: string, label: string, latitude: number, longitude: number) {
  const res = await supabase.from('saved_locations').insert({ user_id: userId, label: label.trim(), latitude, longitude });
  unwrap(res);
}

export async function deleteSavedLocation(id: string) {
  unwrap(await supabase.from('saved_locations').delete().eq('id', id));
}

/* ---------------------------------------------------------------- notifications */
export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  const res = await supabase
    .from('notifications')
    .select('id, type, title_en, body_en, title_ar, body_ar, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (unwrap(res) as AppNotification[] | null) ?? [];
}

export async function unreadCount(): Promise<number> {
  const res = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

export async function markRead(ids?: string[]) {
  return unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null })) as number;
}

export async function registerPushToken(token: string, platform: 'ios' | 'android', deviceName: string | null) {
  unwrap(await supabase.rpc('register_push_token', { p_token: token, p_platform: platform, p_device_name: deviceName }));
}

export async function unregisterPushToken(token: string) {
  await supabase.from('device_push_tokens').delete().eq('token', token);
}

/* ---------------------------------------------------------------- account deletion */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) {
    let code = 'generic';
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? ((await ctx.json()) as { error?: string }) : null;
      code = body?.error ?? code;
    } catch {
      // keep generic
    }
    throw new Error(code);
  }
  if (!(data as { deleted?: boolean } | null)?.deleted) throw new Error('generic');
}
