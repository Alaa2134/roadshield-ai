import { redirect } from 'next/navigation';
import { Users, UserPlus } from 'lucide-react';
import { requireOrg } from '@/lib/session';
import { getAppDict } from '@/lib/i18n/server';
import { supabaseServer } from '@/lib/supabase/server';
import { date } from '@/lib/format';
import { Badge, Card, CardHeader, Field, PageHeader, TableCard } from '@/components/ui';
import { SubmitButton } from '@/components/ui/client';
import { RpcForm } from '@/components/app/RpcForm';
import { InviteResult } from '@/components/app/InviteResult';

export const metadata = { title: 'User Management' };
const ROLES = ['owner', 'finance_manager', 'road_engineer', 'field_inspector', 'contractor', 'executive_viewer'] as const;

export default async function Members() {
  const { org, user } = await requireOrg();
  if (org.role !== 'owner') redirect('/app/organization');
  const { t, p, locale } = await getAppDict();
  const sb = await supabaseServer();
  const [{ data: members }, { data: invites }, { data: ctrs }] = await Promise.all([
    sb.rpc('org_member_directory', { p_org: org.org_id }),
    sb.from('org_invitations').select('id, email, role, expires_at, accepted_at, revoked_at, created_at').eq('org_id', org.org_id).order('created_at', { ascending: false }),
    sb.from('contractors').select('id, name').eq('org_id', org.org_id),
  ]);
  const pending = ((invites ?? []) as { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }[]).filter((i) => !i.accepted_at && !i.revoked_at && i.expires_at > new Date().toISOString());
  const contractors = (ctrs ?? []) as { id: string; name: string }[];
  return (
    <>
      <PageHeader title={t.nav.users} subtitle={p.org.subtitle} />
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <TableCard title={p.org.members}>
          <table className="table" data-testid="members"><thead><tr><th>{t.common.name}</th><th>{p.org.email}</th><th>{p.org.role}</th><th /></tr></thead>
            <tbody>{((members ?? []) as { user_id: string; full_name: string; email: string; role: string; contractor_id: string | null }[]).map((m) => (
              <tr key={m.user_id}><td className="font-[540]">{m.full_name || '—'} {m.user_id === user.id ? <span className="text-xs text-ink-3">({p.org.you})</span> : null}</td><td className="text-ink-2">{m.email}</td>
                <td>
                  <RpcForm rpc="set_member_role" t={t} hidden={{ p_org: org.org_id, p_user: m.user_id, p_contractor_id: m.contractor_id }} revalidate="/app/organization/members" className="flex items-center gap-1.5">
                    <select name="p_role" className="select h-8 w-auto text-xs" defaultValue={m.role} aria-label={p.org.role}>{ROLES.filter((r) => r !== 'contractor' || m.contractor_id).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}</select>
                    <SubmitButton size="sm" variant="ghost">{t.common.save}</SubmitButton>
                  </RpcForm>
                </td>
                <td>{m.user_id !== user.id ? <RpcForm rpc="remove_member" t={t} hidden={{ p_org: org.org_id, p_user: m.user_id }} revalidate="/app/organization/members"><SubmitButton size="sm" variant="ghost" className="text-crit-text">{p.org.remove}</SubmitButton></RpcForm> : null}</td></tr>))}</tbody></table>
        </TableCard>
        <div className="grid content-start gap-5">
          <Card><CardHeader title={p.org.invite} icon={UserPlus} />
            <InviteResult orgId={org.org_id} t={t} labels={{ email: p.org.email, role: p.org.role, token: p.org.token, invite: p.org.invite, contractor: p.projects.contractor }} roles={ROLES.map((r) => ({ value: r, label: t.roles[r] }))} contractors={contractors} />
          </Card>
          <TableCard title={p.org.pendingInvites}>
            {pending.length ? <table className="table"><tbody>{pending.map((i) => <tr key={i.id}><td>{i.email}</td><td><Badge>{t.roles[i.role as keyof typeof t.roles]}</Badge></td><td className="text-xs text-ink-2">{p.org.expires} {date(i.expires_at, locale)}</td>
              <td><RpcForm rpc="revoke_invitation" t={t} hidden={{ p_id: i.id }} revalidate="/app/organization/members"><SubmitButton size="sm" variant="ghost">{p.org.revoke}</SubmitButton></RpcForm></td></tr>)}</tbody></table>
              : <p className="px-5 py-4 text-sm text-ink-2"><Users size={14} className="me-1 inline" />{t.common.none}</p>}
          </TableCard>
        </div>
      </div>
    </>
  );
}
