import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { fetchProfile } from '@/lib/api/profile';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/types';

type SessionState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  role: UserRole;
  /** Set while a password-recovery deep link is being completed. */
  recovering: boolean;
  setProfile: (profile: Profile) => void;
  refreshProfile: () => Promise<void>;
};

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  role: 'citizen',
  recovering: false,
  setProfile: (profile) => set({ profile }),
  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;
    try {
      const { profile, role } = await fetchProfile(uid);
      set({ profile, role });
    } catch {
      // keep the last known profile when offline
    }
  },
}));

export const isStaff = (role: UserRole) => role === 'maintenance_officer' || role === 'admin';

let started = false;
export function startSessionListener() {
  if (started) return;
  started = true;
  void supabase.auth.getSession().then(async ({ data }) => {
    useSession.setState({ session: data.session });
    if (data.session) await useSession.getState().refreshProfile();
    useSession.setState({ ready: true });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    useSession.setState({ session });
    if (event === 'PASSWORD_RECOVERY') useSession.setState({ recovering: true });
    if (event === 'SIGNED_OUT') useSession.setState({ profile: null, role: 'citizen', recovering: false });
    if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
      // Defer to avoid calling Supabase inside the auth callback (prevents a known deadlock).
      setTimeout(() => void useSession.getState().refreshProfile(), 0);
    }
  });
}
