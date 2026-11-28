import { HardHat } from 'lucide-react';
import { requireOrg, can } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Field, PageHeader, TableCard } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';

export const metadata = { title: 'Contractors' };
type C = { id: string; name: string; registration_no: string | null; contact_name: string | null; contact_email: string | null; phone: string | null; qualifications: string; status: string };

export default async function Contractors() {
  const { org } = await requireOrg();
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [{ data }, { data: wos }, { data: contracts }, { data: prjs }] = await Promise.all([
    sb.from('contractors').select('*').eq('org_id', org.org_id).order('name'),
    sb.from('work_orders').select('contractor_id, status').eq('org_id', org.org_id),
    can.financeOrEngineer(org.role) ? sb.from('contracts').select('contractor_id, amount, currency').eq('org_id', org.org_id) : Promise.resolve({ data: [] }),
    sb.from('maintenance_projects').select('contractor_id').eq('org_id', org.org_id),
  ]);
  const rows = (data ?? []) as C[];
  const w = (wos ?? []) as { contractor_id: string | null; status: string }[];
  const ct = (contracts ?? []) as { contractor_id: string; amount: number; currency: string }[];
  const pj = (prjs ?? []) as { contractor_id: string | null }[];
  const tone = (s: string) => (s === 'active' ? 'green' : s === 'suspended' ? 'red' : 'neutral') as 'green' | 'red' | 'neutral';
  return (
    <>
      <PageHeader title={p.contractors.title} subtitle={p.contractors.subtitle} />
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <TableCard>
          {rows.length ? (
            <table className="table"><thead><tr><th>{t.common.name}</th><th>{p.contractors.contact}</th><th className="num">{p.contractors.projects}</th><th className="num">{p.contractors.workOrders}</th><th className="num">{p.contractors.accepted}</th><th className="num">{p.contractors.returned}</th>{can.financeOrEngineer(org.role) ? <th className="num">{p.contractors.contracted}</th> : null}<th>{t.common.status}</th></tr></thead>
              <tbody>{rows.map((c) => {
                const mine = w.filter((x) => x.contractor_id === c.id);
                const sum = ct.filter((x) => x.contractor_id === c.id).reduce((a, x) => a + Number(x.amount), 0);
                return (
                  <tr key={c.id}><td><p className="font-[560]">{c.name}</p><p className="text-[11px] text-ink-3">{c.registration_no ?? '—'}</p></td>
                    <td className="text-xs text-ink-2"><p>{c.contact_name ?? '—'}</p><p>{c.contact_email ?? ''}</p></td>
                    <td className="num">{pj.filter((x) => x.contractor_id === c.id).length}</td><td className="num">{mine.length}</td>
                    <td className="num">{mine.filter((x) => x.status === 'accepted').length}</td><td className="num">{mine.filter((x) => x.status === 'rejected').length}</td>
                    {can.financeOrEngineer(org.role) ? <td className="num">{sum ? money(sum, org.default_currency, locale) : '—'}</td> : null}
                    <td><Badge tone={tone(c.status)} dot>{p.contractors[c.status as 'active']}</Badge></td></tr>
                );
              })}</tbody></table>
          ) : <EmptyState icon={HardHat} title={t.empty.contractors} body={t.empty.contractorsBody} />}
        </TableCard>
        {org.role === 'owner' || org.role === 'finance_manager' || org.role === 'road_engineer' ? (
          <Card className="self-start"><CardHeader title={p.contractors.add} icon={HardHat} />
            <RpcForm rpc="upsert_contractor" t={t} hidden={{ p_org: org.org_id, p_status: 'active' }} revalidate="/app/contractors" resetOnSuccess className="grid gap-3" testId="contractor-form">
              <Field label={t.common.name} name="p_name" required><input name="p_name" className="input" required minLength={2} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={p.contractors.registration} name="p_registration_no"><input name="p_registration_no" className="input" /></Field>
                <Field label={p.contractors.contact} name="p_contact_name"><input name="p_contact_name" className="input" /></Field>
                <Field label={p.contractors.email} name="p_contact_email"><input name="p_contact_email" type="email" className="input" /></Field>
                <Field label={p.contractors.phone} name="p_phone"><input name="p_phone" className="input" /></Field>
              </div>
              <Field label={p.contractors.qualifications} name="p_qualifications"><textarea name="p_qualifications" className="textarea" rows={2} /></Field>
              <div className="flex justify-end"><SubmitButton size="sm">{t.common.create}</SubmitButton></div>
            </RpcForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
