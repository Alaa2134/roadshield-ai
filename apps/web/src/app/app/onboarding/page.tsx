import { Building2, KeyRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { Card, CardHeader, Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';

export const metadata = { title: 'Set up' };

export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect('/sign-in');
  const { t, locale } = await getAppDict();
  const o = t.onboarding;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={o.title} subtitle={o.body} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={o.create} icon={Building2} subtitle={o.pilotHint} />
          <RpcForm rpc="create_organization" t={t} redirect="/app" testId="create-org" className="space-y-4" hidden={{ p_locale: locale }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={o.orgName} name="p_name" required><input id="p_name" name="p_name" className="input" required minLength={2} maxLength={120} /></Field>
              <Field label={o.orgNameAr} name="p_name_ar"><input id="p_name_ar" name="p_name_ar" className="input" dir="rtl" maxLength={120} /></Field>
              <Field label={o.slug} name="p_slug" required hint="lowercase-with-dashes"><input id="p_slug" name="p_slug" className="input" required pattern="[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]" /></Field>
              <Field label={o.type} name="p_org_type">
                <select id="p_org_type" name="p_org_type" className="select" defaultValue="municipality">
                  {Object.entries(o.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label={o.country} name="p_country_code" required><input id="p_country_code" name="p_country_code" className="input uppercase" required defaultValue="EG" maxLength={2} pattern="[A-Za-z]{2}" /></Field>
              <Field label={o.currency} name="p_currency" required><input id="p_currency" name="p_currency" className="input uppercase" required defaultValue="EGP" maxLength={3} pattern="[A-Za-z]{3}" /></Field>
              <Field label={o.timezone} name="p_timezone"><input id="p_timezone" name="p_timezone" className="input" defaultValue="Africa/Cairo" /></Field>
              <Field label={o.region} name="p_region"><input id="p_region" name="p_region" className="input" placeholder="Damietta" /></Field>
              <Field label={o.city} name="p_city"><input id="p_city" name="p_city" className="input" placeholder="New Damietta" /></Field>
            </div>
            <div className="flex justify-end"><SubmitButton testId="create-org-submit">{o.create}</SubmitButton></div>
          </RpcForm>
        </Card>
        <Card className="self-start">
          <CardHeader title={o.join} icon={KeyRound} />
          <RpcForm rpc="accept_invitation" t={t} redirect="/app" className="space-y-4" testId="join-org">
            <Field label={o.token} name="p_token" required><input id="p_token" name="p_token" className="input font-mono" required minLength={20} autoComplete="off" /></Field>
            <SubmitButton variant="secondary" className="w-full">{o.join}</SubmitButton>
          </RpcForm>
        </Card>
      </div>
    </div>
  );
}
