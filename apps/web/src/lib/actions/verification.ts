'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/components/ui/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['official_letter', 'registration', 'authorization', 'representative_id', 'other'];
const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX = 4 * 1024 * 1024; // server actions accept bodies up to 4 MB (next.config.ts)

/** Uploads a verification document into the private org-documents bucket and registers it. */
export async function uploadVerificationDocument(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const org = String(form.get('p_org') ?? '');
  const kind = String(form.get('p_doc_kind') ?? '');
  const file = form.get('file');
  if (!UUID.test(org) || !KINDS.includes(kind) || !(file instanceof File)) return { ok: false, error: 'INVALID_INPUT' };
  const ext = TYPES[file.type];
  if (!ext || file.size === 0 || file.size > MAX) return { ok: false, error: 'UPLOAD_FAILED' };
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'NOT_AUTHENTICATED' };
  const path = `${org}/${user.id}/verification-${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const up = await sb.storage.from('org-documents').upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: 'UPLOAD_FAILED' };
  const { error } = await sb.rpc('register_verification_document', {
    p_org: org, p_doc_kind: kind, p_storage_path: path, p_filename: file.name.slice(0, 200), p_mime_type: file.type, p_size_bytes: file.size,
  });
  if (error) return { ok: false, error: /^[A-Z_]+$/.test(error.message) ? error.message : 'generic' };
  revalidatePath('/app/organization/verification');
  return { ok: true };
}
