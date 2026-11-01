// RoadShield AI — delete-account Edge Function
//
// Permanently deletes the calling user's account:
//   1. verifies the caller's session token with Supabase Auth,
//   2. requires an explicit confirmation phrase in the request body,
//   3. removes every photo the user uploaded (storage objects + image rows),
//   4. writes an audit entry, then deletes the auth user.
// Hazard reports remain as anonymised public-safety records (reporter_id is set to NULL by
// the foreign key); notifications, tokens, saved places and confirmations cascade away.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // fall through
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No service key available in the function environment');
  return legacy;
}

async function listAllPaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 4) return [];
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const entry of data) {
      const full = `${prefix}/${entry.name}`;
      // Folders have no id/metadata in the listing.
      if (entry.id === null || entry.metadata === null) {
        paths.push(...(await listAllPaths(admin, bucket, full, depth + 1)));
      } else {
        paths.push(full);
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'missing_token' });

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (body.confirm !== 'DELETE') return json(400, { error: 'confirmation_required' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: 'invalid_session' });
  const uid = userData.user.id;

  // Never let the last administrator delete themselves and lock the system.
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
  if (roleRow?.role === 'admin') {
    const { count } = await admin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) return json(409, { error: 'LAST_ADMIN' });
  }

  const removed: Record<string, number> = {};
  for (const bucket of ['hazard-images', 'avatars']) {
    const paths = await listAllPaths(admin, bucket, uid);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) return json(500, { error: 'storage_cleanup_failed', detail: error.message });
    }
    removed[bucket] = paths.length;
  }

  const { error: imagesError } = await admin.from('hazard_images').delete().eq('uploader_id', uid);
  if (imagesError) return json(500, { error: 'image_rows_cleanup_failed', detail: imagesError.message });

  await admin.from('audit_logs').insert({
    actor_id: uid,
    action: 'account.delete',
    entity_type: 'user',
    entity_id: uid,
    details: { removed_files: removed },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) return json(500, { error: 'delete_failed', detail: deleteError.message });

  return json(200, { deleted: true, removed_files: removed });
});
