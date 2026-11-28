'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import type { ActionResult } from '@/components/ui/client';

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/app') && !n.startsWith('//') ? n : '/app');

export async function signIn(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const d = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() }).safeParse(Object.fromEntries(form));
  if (!d.success) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: d.data.email, password: d.data.password });
  if (error) return { ok: false, error: /confirm/i.test(error.message) ? 'EMAIL_NOT_VERIFIED' : 'INVALID_CREDENTIALS' };
  redirect(safeNext(d.data.next));
}

export async function signUp(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const d = z.object({ email: z.string().email(), password: z.string().min(10).max(72), full_name: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(form));
  if (!d.success) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const locale = form.get('locale') === 'ar' ? 'ar' : 'en';
  const { data, error } = await sb.auth.signUp({
    email: d.data.email, password: d.data.password,
    options: { data: { full_name: d.data.full_name, locale }, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/app/onboarding` },
  });
  if (error) return { ok: false, error: /rate/i.test(error.message) ? 'RATE_LIMITED' : 'generic' };
  if (data.session) redirect('/app/onboarding');
  return { ok: true };
}

export async function requestReset(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get('email') ?? '');
  if (!z.string().email().safeParse(email).success) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
  return { ok: true }; // never reveal whether the account exists
}

export async function updatePassword(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const pw = String(form.get('password') ?? '');
  if (pw.length < 10) return { ok: false, error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) return { ok: false, error: 'generic' };
  redirect('/app');
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect('/sign-in');
}
