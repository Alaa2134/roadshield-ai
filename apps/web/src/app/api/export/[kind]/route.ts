import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';

// CSV exports. Queries run as the signed-in user, so RLS decides what each role receives.
const KINDS: Record<string, { table: string; cols: string; order: string }> = {
  roads: { table: 'road_segments', cols: 'id,osm_way_id,name,name_ar,ref,highway_class,surface_osm,lanes_osm,width_m,length_m,condition,condition_assessed_at,source,source_license,source_retrieved_at', order: 'name' },
  cost_items: { table: 'cost_items', cols: 'id,project_id,work_order_id,category,description,unit,quantity,unit_rate,amount,currency,cost_date,source_kind,status,reviewed_at', order: 'cost_date' },
  invoices: { table: 'invoices', cols: 'id,project_id,contract_id,invoice_number,invoice_date,net_amount,tax_amount,total_amount,currency,status,reviewed_at', order: 'invoice_date' },
  payments: { table: 'payments', cols: 'id,project_id,invoice_id,amount,currency,paid_on,reference', order: 'paid_on' },
  budgets: { table: 'budgets', cols: 'id,project_id,road_id,fiscal_year,label,amount,currency,funding_source,status,reviewed_at', order: 'fiscal_year' },
  audit: { table: 'audit_logs', cols: 'id,created_at,actor_id,action,entity_type,entity_id,details', order: 'created_at' },
};

const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const { org } = await requireOrg();
  const sb = await supabaseServer();
  let rows: Record<string, unknown>[] = [];
  let cols: string[] = [];
  if (kind === 'projects') {
    const { data, error } = await sb.rpc('project_list', { p_org: org.org_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    rows = (data ?? []) as Record<string, unknown>[];
    cols = ['id', 'code', 'name', 'status', 'priority', 'currency', 'contractor_name', 'road_count', 'road_km', 'planned_start', 'planned_end', 'approved_budget', 'committed', 'verified_actual', 'paid'];
  } else {
    const k = KINDS[kind];
    if (!k) return NextResponse.json({ error: 'unknown export' }, { status: 404 });
    const { data, error } = await sb.from(k.table).select(k.cols).eq('org_id', org.org_id).order(k.order, { ascending: true }).limit(100000);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    rows = (data ?? []) as unknown as Record<string, unknown>[];
    cols = k.cols.split(',');
  }
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="roadshield-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}
