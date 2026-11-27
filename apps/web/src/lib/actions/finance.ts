'use server';
import { supabaseServer } from '@/lib/supabase/server';

export type MonthRecords = { month: string;
  cost_items: { id: string; project_id: string; project_code: string; category: string; description: string; amount: number; currency: string; date: string }[];
  invoices: { id: string; project_id: string; project_code: string; number: string; amount: number; currency: string; date: string }[];
  payments: { id: string; project_id: string; project_code: string; reference: string; amount: number; currency: string; date: string }[] };

export async function getMonthRecords(org: string, month: string): Promise<MonthRecords | { error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(org) || !/^\d{4}-\d{2}$/.test(month)) return { error: 'INVALID_INPUT' };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('org_month_records', { p_org: org, p_month: month });
  if (error) return { error: /^[A-Z_]+$/.test(error.message) ? error.message : 'generic' };
  return data as MonthRecords;
}
