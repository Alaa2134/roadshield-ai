import type { Metadata } from 'next';
import { ActionForm, SubmitButton } from '@/components/ui/client';
import { Field } from '@/components/ui';
import { updatePassword } from '@/lib/actions/auth';
import { getDict } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'New password', robots: { index: false } };

export default async function Reset() {
  const { t } = await getDict();
  return (
    <>
      <h1 className="t-page">{t.auth.password}</h1>
      <ActionForm action={updatePassword} errors={t.errors} className="mt-7 space-y-4">
        <Field label={t.auth.password} name="password" required hint={t.auth.passwordHint}><input id="password" name="password" type="password" className="input" required minLength={10} autoComplete="new-password" /></Field>
        <SubmitButton className="w-full" size="lg">{t.common.save}</SubmitButton>
      </ActionForm>
    </>
  );
}
