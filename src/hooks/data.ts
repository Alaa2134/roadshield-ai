import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { myActivity, myReports, myStats, nearbyHazards } from '@/lib/api/hazards';
import { listNotifications, unreadCount } from '@/lib/api/profile';
import { bboxOf } from '@/lib/geo';
import { checkLocationPermission, getCurrentPosition, refreshCity, useLocationStore } from '@/lib/location';
import { cacheHazards, cachedHazardsInBBox, cacheTimestamp } from '@/lib/offline/cache';
import { listDrafts, pendingCount, useDraftsVersion, type Draft } from '@/lib/offline/drafts';
import { qk } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { haversine } from '@/lib/geo';
import type { HazardSummary } from '@/lib/types';
import { useNetwork } from '@/stores/network';
import { useSession } from '@/stores/session';

/** Current location (only if permission was already granted — never prompts by itself). */
export function useMyLocation() {
  const position = useLocationStore((s) => s.position);
  const permission = useLocationStore((s) => s.permission);
  const city = useLocationStore((s) => s.city);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      if (pos) void refreshCity(pos);
    } catch {
      // location services off
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkLocationPermission().then((ok) => {
      if (ok) void refresh();
    });
  }, []);

  return { position, permission, city, loading, refresh };
}

/**
 * Verified hazards near a point. Online: from the server (and cached). Offline: from the
 * local cache, flagged so the UI can say the data may be out of date.
 */
export function useNearbyHazards(lat: number | undefined, lng: number | undefined, radiusM: number) {
  const online = useNetwork((s) => s.online);
  return useQuery({
    queryKey: qk.nearby(lat ?? 0, lng ?? 0, radiusM),
    enabled: lat != null && lng != null,
    queryFn: async (): Promise<{ hazards: HazardSummary[]; fromCache: boolean; cachedAt: number | null }> => {
      const here = { latitude: lat!, longitude: lng! };
      if (online) {
        try {
          const hazards = await nearbyHazards(lat!, lng!, radiusM, 50);
          void cacheHazards(hazards);
          return { hazards, fromCache: false, cachedAt: null };
        } catch {
          // fall back to cache below
        }
      }
      const cached = (await cachedHazardsInBBox(bboxOf([here], radiusM)))
        .map((h) => ({ ...h, distance_m: haversine(here, h) }))
        .filter((h) => h.distance_m <= radiusM)
        .sort((a, b) => a.distance_m - b.distance_m);
      return { hazards: cached, fromCache: true, cachedAt: await cacheTimestamp() };
    },
  });
}

export function useMyStats() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({ queryKey: qk.stats, queryFn: myStats, enabled: !!uid });
}

export function useMyActivity() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({ queryKey: qk.activity, queryFn: () => myActivity(6), enabled: !!uid });
}

export function useMyReports() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({ queryKey: qk.myReports(uid ?? ''), queryFn: () => myReports(uid!), enabled: !!uid });
}

export function useNotifications() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({ queryKey: qk.notifications, queryFn: () => listNotifications(80), enabled: !!uid });
}

/** Unread count with live updates via Supabase Realtime (RLS limits rows to the user). */
export function useUnread() {
  const uid = useSession((s) => s.session?.user.id);
  const client = useQueryClient();
  const query = useQuery({ queryKey: qk.unread, queryFn: unreadCount, enabled: !!uid });
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        void client.invalidateQueries({ queryKey: qk.unread });
        void client.invalidateQueries({ queryKey: qk.notifications });
        void client.invalidateQueries({ queryKey: qk.activity });
        void client.invalidateQueries({ queryKey: qk.stats });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, client]);
  return query;
}

export function useDrafts() {
  const uid = useSession((s) => s.session?.user.id);
  const version = useDraftsVersion((s) => s.v);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!uid) return;
    void listDrafts(uid).then(setDrafts);
    void pendingCount(uid).then(setPending);
  }, [uid, version]);
  return { drafts, pending };
}
