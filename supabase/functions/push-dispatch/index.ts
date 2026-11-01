// RoadShield AI — push-dispatch Edge Function
//
// Called by Postgres (pg_net trigger on public.notifications) for every new in-app
// notification. Delivers it through the Expo Push Service to the recipient's registered
// devices, in the recipient's language, respecting their notification preferences.
//
// Auth: the trigger sends `x-dispatch-secret`; it is checked against the value stored in
// the private settings table through a service-role-only RPC. Each notification can be
// claimed exactly once (pending -> sent/failed/skipped/no_tokens), so retries or replays
// never send duplicates.

import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationRow = {
  id: string;
  user_id: string;
  type:
    | 'report_confirmation'
    | 'verification_update'
    | 'nearby_hazard'
    | 'maintenance_progress'
    | 'report_resolved'
    | 'system_announcement';
  title_en: string;
  body_en: string;
  title_ar: string;
  body_ar: string;
  data: Record<string, unknown>;
};

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // fall through to the legacy key
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No service key available in the function environment');
  return legacy;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function preferenceAllows(
  type: NotificationRow['type'],
  prefs: { notify_status_updates: boolean; notify_nearby: boolean; notify_announcements: boolean },
): boolean {
  if (type === 'nearby_hazard') return prefs.notify_nearby;
  if (type === 'system_announcement') return prefs.notify_announcements;
  return prefs.notify_status_updates;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = req.headers.get('x-dispatch-secret') ?? '';
  let body: { notification_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const notificationId = body.notification_id;
  if (!notificationId || !/^[0-9a-f-]{36}$/i.test(notificationId)) {
    return json(400, { error: 'invalid_notification_id' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: secretOk, error: secretError } = await admin.rpc('verify_dispatch_secret', {
    p_secret: secret,
  });
  if (secretError || secretOk !== true) return json(401, { error: 'unauthorized' });

  // Claim the notification atomically: only a still-pending row is processed.
  const { data: claimed, error: claimError } = await admin
    .from('notifications')
    .update({ push_status: 'sent', push_error: null })
    .eq('id', notificationId)
    .eq('push_status', 'pending')
    .select('id, user_id, type, title_en, body_en, title_ar, body_ar, data')
    .maybeSingle<NotificationRow>();

  if (claimError) return json(500, { error: 'claim_failed', detail: claimError.message });
  if (!claimed) return json(200, { status: 'already_processed' });

  const finish = async (status: 'sent' | 'failed' | 'skipped' | 'no_tokens', error?: string) => {
    await admin
      .from('notifications')
      .update({ push_status: status, push_error: error ?? null })
      .eq('id', claimed.id);
    return json(200, { status, error });
  };

  const { data: profile } = await admin
    .from('profiles')
    .select('locale, notify_status_updates, notify_nearby, notify_announcements')
    .eq('id', claimed.user_id)
    .maybeSingle();

  if (!profile) return finish('skipped', 'recipient profile not found');
  if (!preferenceAllows(claimed.type, profile)) return finish('skipped', 'disabled by user preference');

  const { data: tokens } = await admin
    .from('device_push_tokens')
    .select('id, token')
    .eq('user_id', claimed.user_id)
    .is('disabled_at', null);

  if (!tokens || tokens.length === 0) return finish('no_tokens');

  const arabic = profile.locale === 'ar';
  const messages = tokens.map((t) => ({
    to: t.token,
    title: arabic ? claimed.title_ar : claimed.title_en,
    body: arabic ? claimed.body_ar : claimed.body_en,
    sound: 'default',
    channelId: claimed.type === 'nearby_hazard' ? 'hazard-alerts' : 'default',
    priority: claimed.type === 'nearby_hazard' ? 'high' : 'default',
    data: { ...claimed.data, notification_id: claimed.id, type: claimed.type },
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  let tickets: ExpoTicket[] = [];
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const payload = (await response.json()) as { data?: ExpoTicket[]; errors?: unknown };
    if (!response.ok || !payload.data) {
      return finish('failed', `expo_http_${response.status}: ${JSON.stringify(payload.errors ?? payload)}`.slice(0, 500));
    }
    tickets = payload.data;
  } catch (error) {
    return finish('failed', `expo_unreachable: ${String(error)}`.slice(0, 500));
  }

  const failures: string[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (ticket.status === 'error') {
      failures.push(ticket.details?.error ?? ticket.message);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await admin
          .from('device_push_tokens')
          .update({ disabled_at: new Date().toISOString() })
          .eq('id', tokens[i].id);
      }
    }
  }

  if (failures.length === tickets.length) return finish('failed', failures.join(', ').slice(0, 500));
  return finish('sent', failures.length ? `partial: ${failures.join(', ')}`.slice(0, 500) : undefined);
});
