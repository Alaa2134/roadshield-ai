'use server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/components/ui/client';

const schema = z.object({
  kind: z.enum(['contact', 'demo']),
  interest: z.enum(['demo', 'pilot', 'partnership', 'security', 'other']).default('other'),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  organization: z.string().trim().max(160).optional().default(''),
  country: z.string().trim().max(80).optional().default(''),
  job_role: z.string().trim().max(120).optional().default(''),
  message: z.string().trim().max(4000).optional().default(''),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function submitContact(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const d = parsed.data;
  const locale = (await headers()).get('cookie')?.includes('rs_locale=ar') ? 'ar' : 'en';
  const sb = await supabaseServer();
  const { error } = await sb.rpc('submit_contact_request', {
    p_kind: d.kind, p_interest: d.interest, p_full_name: d.full_name, p_email: d.email, p_organization: d.organization,
    p_country: d.country, p_job_role: d.job_role, p_message: d.message, p_locale: locale,
  });
  if (error) return { ok: false, error: error.message in { RATE_LIMITED: 1, INVALID_INPUT: 1 } ? error.message : 'generic' };
  const hook = process.env.CONTACT_WEBHOOK_URL;
  if (hook) {
    // Best-effort delivery to the sales inbox / CRM; the request is already stored.
    await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...d, website: undefined }) }).catch(() => undefined);
  }
  return { ok: true };
}
