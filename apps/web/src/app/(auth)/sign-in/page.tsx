import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { Field, Notice } from '@/components/ui';
import { signIn } from '@/lib/actions/auth';
import { getDict } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; verified?: string }> }) {
  const { t, locale } = await getDict();
  const sp = await searchParams;
  return (
    <>
      <h1 className="t-page">{t.auth.welcome}</h1>
      <p className="mt-1.5 text-sm text-ink-2">{t.auth.welcomeBody}</p>
      {sp.error ? <div className="mt-5"><Notice tone="amber">{sp.error === 'link' ? (locale === 'ar' ? 'رابط التفعيل أو استعادة كلمة المرور غير صالح أو منتهي، أو تم فتحه في متصفح آخر. حاول تسجيل الدخول إذا تم تأكيد بريدك، أو اطلب رابط استعادة جديدًا.' : 'This verification or password reset link is invalid, expired, or was opened in another browser. If your email is confirmed, try signing in, or request a new password reset link.') : t.errors.INVITATION_INVALID}</Notice></div> : null}
      <ActionForm action={signIn} errors={t.errors} className="mt-7 space-y-4" testId="sign-in-form">
        <input type="hidden" name="next" value={sp.next ?? '/app'} />
        <Field label={t.auth.email} name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" autoFocus /></Field>
        <Field label={t.auth.password} name="password" required><input id="password" name="password" type="password" className="input" required autoComplete="current-password" /></Field>
        <div className="flex justify-end"><Link href="/forgot-password" className="text-[13px] font-[540] text-accent-text hover:underline">{t.auth.forgot}</Link></div>
        <SubmitButton className="w-full" size="lg" testId="sign-in-submit">{t.auth.signIn}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-2">{t.auth.noAccount} <Link href="/sign-up" className="font-[560] text-accent-text hover:underline">{t.auth.signUp}</Link></p>
    </>
  );
}
