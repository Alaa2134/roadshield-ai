// RoadShield OS end-to-end journeys (Playwright, real browser, real database through the
// local dev gateway). Uses clearly labelled TEST FIXTURE data in a throwaway local database.
//
// Prereqs: local DB + dev gateway (supabase/local) and `next dev`/`next start` on BASE_URL.
// Run:     node tests/e2e/run.mjs   (SHOTS=dir to save screenshots)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS ?? '';
const run = Date.now().toString(36);
const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost/roadshield_local';
// Test-only: promote a freshly signed-up e2e user to platform admin in the throwaway local DB.
const makeAdmin = (email) => execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-qc',
  `update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = '${email.replace(/'/g, "''")}')`]);
const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fixtures/test-roads.geojson');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ' :: ' + detail}`); };
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
async function newUser(label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors, email: `e2e-${label}-${run}@example.com`, password: `Test-pass-${run}!` };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
async function signUp(u, name) {
  await u.page.goto(`${BASE}/sign-up`);
  await u.page.fill('input[name=full_name]', name);
  await u.page.fill('input[name=email]', u.email);
  await u.page.fill('input[name=password]', u.password);
  await u.page.click('form[data-testid=sign-up-form] button[type=submit]');
  await u.page.waitForURL(/\/app\/onboarding/);
}
async function rpcForm(page, testId, fill = {}, submitTestId) {
  const form = page.locator(`form[data-testid=${testId}]`).first();
  for (const [k, v] of Object.entries(fill)) {
    const el = form.locator(`[name=${k}]`).first();
    const tag = await el.evaluate((e) => e.tagName);
    if (tag === 'SELECT') await el.selectOption(String(v)); else await el.fill(String(v));
  }
  await (submitTestId ? page.locator(`[data-testid=${submitTestId}]`).first() : form.locator('button[type=submit]').last()).click();
  await page.waitForLoadState('networkidle');
}
const formMsg = async (page, testId) => {
  const f = page.locator(`form[data-testid=${testId}]`).first();
  await page.waitForTimeout(400);
  if (await f.locator('[data-testid=form-error]').count()) return 'ERR:' + (await f.locator('[data-testid=form-error]').innerText());
  return (await f.locator('[data-testid=form-success]').count()) ? 'OK' : 'NONE';
};

try {
  // ---------------------------------------------------------------- public site
  const anon = await newUser('anon');
  await anon.page.goto(BASE);
  check('Public homepage renders hero', (await anon.page.locator('h1').innerText()).toLowerCase().includes('pothole'));
  await anon.page.goto(`${BASE}/app`);
  check('Unauthenticated /app redirects to sign-in', anon.page.url().includes('/sign-in'));
  await anon.page.goto(`${BASE}/contact`);
  await anon.page.fill('input[name=full_name]', 'E2E Visitor');
  await anon.page.fill('input[name=email]', `visitor-${run}@example.com`);
  await anon.page.fill('textarea[name=message]', 'Automated test message');
  await anon.page.click('[data-testid=contact-submit]');
  await anon.page.waitForSelector('[data-testid=form-success], [data-testid=form-error]');
  check('Contact form stores a request in the database', await anon.page.locator('[data-testid=form-success]').count() === 1);

  // ---------------------------------------------------------------- Journey: owner sets up org
  const owner = await newUser('owner');
  await signUp(owner, 'E2E Owner');
  check('Sign-up lands on organization onboarding', owner.page.url().includes('/app/onboarding'));
  await rpcForm(owner.page, 'create-org', { p_name: `E2E Test Municipality ${run}`, p_slug: `e2e-${run}`, p_city: 'Test City', p_governorate: 'Damietta' }, 'create-org-submit');
  await owner.page.waitForURL(`${BASE}/app`);
  check('Organization created; owner lands on overview', await owner.page.locator('h1').count() > 0);
  await shot(owner.page, '01-overview-empty');

  // ---------------------------------------------------------------- Journey: organization verification
  check('New organization starts in limited mode (verification banner shown)', await owner.page.locator('[data-testid=verification-banner]').count() === 1);
  await owner.page.goto(`${BASE}/app/contractors`);
  await rpcForm(owner.page, 'contractor-form', { p_name: `E2E Too Early ${run}` });
  check('Unverified organization cannot add records', (await formMsg(owner.page, 'contractor-form')).startsWith('ERR:'));
  await owner.page.goto(`${BASE}/app/organization/verification`);
  await owner.page.selectOption('#p_governorate', { label: 'Damietta' });
  await owner.page.selectOption('#p_city', { label: 'New Damietta' });
  await owner.page.click('[data-testid=jurisdiction-submit]');
  await owner.page.waitForLoadState('networkidle');
  check('Owner sets jurisdiction to a governorate and city', (await formMsg(owner.page, 'jurisdiction-form')) === 'OK');
  for (const [kind, file] of [['official_letter', 'official-letter.pdf'], ['authorization', 'authorization.pdf']]) {
    await owner.page.selectOption('#p_doc_kind', kind);
    await owner.page.setInputFiles('#file', { name: file, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% RoadShield E2E TEST FIXTURE ${kind}\n%%EOF\n`) });
    await owner.page.click('[data-testid=verification-upload-submit]');
    await owner.page.waitForFunction((n) => document.querySelectorAll('[data-testid=verification-docs] li').length >= n, kind === 'official_letter' ? 1 : 2);
  }
  check('Owner uploads two verification documents to private storage', await owner.page.locator('[data-testid=verification-docs] li').count() === 2);
  await owner.page.click('[data-testid=verification-submit]');
  await owner.page.waitForLoadState('networkidle');
  await owner.page.reload();
  check('Verification request submitted for review', await owner.page.locator('[data-testid=verification-submit]').count() === 0);
  await shot(owner.page, '01b-verification-submitted');

  const admin = await newUser('admin');
  await signUp(admin, 'E2E Platform Admin');
  makeAdmin(admin.email);
  await admin.page.goto(`${BASE}/app/admin/verifications`);
  const card = admin.page.locator('[data-testid=verification-queue] > *', { hasText: `e2e-${run}` });
  check('Platform admin sees the request with its documents', await card.count() === 1 && await card.locator('a[href*="/storage/v1/object/sign/"]').count() === 2);
  const docRes = await admin.page.request.get(await card.locator('a[href*="/storage/v1/object/sign/"]').first().getAttribute('href'));
  check('Admin can open a verification document via a signed link', docRes.ok() && (await docRes.text()).includes('RoadShield E2E TEST FIXTURE'));
  await shot(admin.page, '01c-admin-verification-queue');
  await admin.page.locator(`form[data-testid=approve-e2e-${run}] button[type=submit]`).click();
  await admin.page.waitForLoadState('networkidle');
  await owner.page.goto(`${BASE}/app`);
  check('After admin approval the organization is verified (banner gone)', await owner.page.locator('[data-testid=verification-banner]').count() === 0);

  await owner.page.goto(`${BASE}/app/roads/import`);
  await owner.page.setInputFiles('[data-testid=geojson-file]', fixture);
  await owner.page.click('[data-testid=import-run]');
  await owner.page.waitForFunction(() => document.querySelector('[data-testid=import-status]')?.textContent?.includes('3'));
  check('GeoJSON road import inserts 3 fixture segments', (await owner.page.locator('[data-testid=import-status]').innerText()).includes('3'));

  await owner.page.goto(`${BASE}/app`);
  const km = await owner.page.locator('[data-testid=kpi-managed-km]').innerText();
  check('Overview managed-km KPI is computed from imported geometry', /\d/.test(km) && !km.includes('0 km\n'), km.replace(/\n/g, ' '));

  await owner.page.goto(`${BASE}/app/contractors`);
  await rpcForm(owner.page, 'contractor-form', { p_name: `E2E Paving Contractor ${run}`, p_contact_email: 'paving@example.com' });
  check('Contractor registered', await owner.page.getByText(`E2E Paving Contractor ${run}`).count() > 0);

  await owner.page.goto(`${BASE}/app/projects/new`);
  await owner.page.fill('form[data-testid=new-project] input[name=p_code]', `P-E2E-${run}`);
  await owner.page.fill('form[data-testid=new-project] input[name=p_name]', 'Resurface Test Fixture Avenue A');
  await owner.page.fill('form[data-testid=new-project] input[name=p_verified_damaged_area_m2]', '120');
  await owner.page.fill('[data-testid=road-search]', 'Fixture Avenue');
  await owner.page.getByRole('button', { name: /Test Fixture Avenue A/ }).click();
  await owner.page.click('[data-testid=new-project-submit]');
  await owner.page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}/);
  const projectUrl = owner.page.url().split('?')[0];
  check('Project created with a road segment', (await owner.page.locator('h1').innerText()).includes('Resurface'));

  // Invite finance manager
  await owner.page.goto(`${BASE}/app/organization/members`);
  const fin = await newUser('finance');
  const inviteToken = async (email, role, contractorName) => {
    await owner.page.goto(`${BASE}/app/organization/members`);
    const f = owner.page.locator('form[data-testid=invite-form]');
    await f.locator('input[name=p_email]').fill(email);
    await f.locator('select[name=p_role]').selectOption(role);
    if (contractorName) await f.locator('select[name=p_contractor_id]').selectOption({ label: contractorName });
    await f.locator('button[type=submit]').click();
    await owner.page.waitForSelector('[data-testid=invite-token]');
    return (await owner.page.locator('[data-testid=invite-token] code').innerText()).trim();
  };
  const finToken = await inviteToken(fin.email, 'finance_manager');
  check('Owner invitation returns a one-time token', finToken.length === 48);
  await signUp(fin, 'E2E Finance');
  await rpcForm(fin.page, 'join-org', { p_token: finToken });
  await fin.page.waitForURL(`${BASE}/app`);
  check('Finance manager joined via invitation', fin.page.url().endsWith('/app'));

  // ---------------------------------------------------------------- Journey C: finance + four-eyes
  await fin.page.goto(projectUrl);
  await fin.page.locator('details summary', { hasText: /budget allocation/i }).click();
  await rpcForm(fin.page, 'budget-form', { p_label: 'FY2026 resurfacing (test)', p_amount: '500000' });
  await fin.page.goto(projectUrl);
  check('Four-eyes: submitter sees no approve button on own budget', await fin.page.locator('[data-testid=review-budget-approve]').count() === 0);
  await owner.page.goto(projectUrl);
  await owner.page.click('[data-testid=review-budget-approve]');
  await owner.page.waitForLoadState('networkidle');
  await owner.page.goto(projectUrl);
  await owner.page.click('[data-testid=to-approved]');
  await owner.page.waitForLoadState('networkidle');
  await owner.page.goto(projectUrl);
  check('Project approved after budget approval', (await owner.page.locator('header').first().innerText()).length > 0 && await owner.page.getByText('Approved', { exact: true }).count() > 0);

  // Unit rate (owner adds, finance verifies) → estimate (owner) → finance approves
  await owner.page.goto(`${BASE}/app/finance`);
  await rpcForm(owner.page, 'rate-form', { p_description: 'Asphalt wearing course 5 cm (TEST RATE)', p_unit: 'm2', p_rate: '210.50', p_effective_date: '2026-10-01', p_source_title: 'E2E test rate schedule (fixture)' });
  await fin.page.goto(`${BASE}/app/finance`);
  await fin.page.getByRole('button', { name: 'Verify' }).first().click();
  await fin.page.waitForLoadState('networkidle');
  await owner.page.goto(`${projectUrl}?tab=estimates`);
  const est = owner.page.locator('form[data-testid=estimate-form]');
  await est.locator('input[aria-label=Quantity]').fill('120');
  await est.locator('select').nth(1).selectOption({ index: 1 });
  await owner.page.click('[data-testid=estimate-submit]');
  await owner.page.waitForLoadState('networkidle');
  await fin.page.goto(`${projectUrl}?tab=estimates`);
  await fin.page.click('[data-testid=review-estimate-approve]');
  await fin.page.waitForLoadState('networkidle');
  await fin.page.goto(`${projectUrl}?tab=estimates`);
  check('Estimate from verified unit rate approved (120 × 210.50 = 25,260.00)', (await fin.page.locator('table').first().innerText()).includes('25,260.00'));

  // Contract, work order
  await fin.page.goto(`${projectUrl}?tab=contracts`);
  await rpcForm(fin.page, 'contract-form', { p_reference: `TC-${run}`, p_signed_on: '2026-11-01', p_amount: '30000' });
  check('Contract registered', await fin.page.getByText(`TC-${run}`).count() > 0);
  await owner.page.goto(`${projectUrl}?tab=work-orders`);
  await owner.page.locator('form[data-testid=wo-form] select[name=p_contractor]').selectOption({ label: `E2E Paving Contractor ${run}` });
  await rpcForm(owner.page, 'wo-form', { p_title: 'Mill and overlay Avenue A (test)' });
  await owner.page.goto(`${projectUrl}?tab=work-orders`);
  await owner.page.locator('table a').first().click();
  await owner.page.waitForURL(/work-orders\//);
  const woUrl = owner.page.url();
  await owner.page.click('[data-testid=wo-issued]');
  await owner.page.waitForLoadState('networkidle');

  // ---------------------------------------------------------------- Journey D: contractor
  const con = await newUser('contractor');
  const conToken = await inviteToken(con.email, 'contractor', `E2E Paving Contractor ${run}`);
  await signUp(con, 'E2E Contractor');
  await rpcForm(con.page, 'join-org', { p_token: conToken });
  await con.page.waitForURL(`${BASE}/app`);
  check('Contractor sees the contractor workspace', (await con.page.locator('h1').innerText()).toLowerCase().includes('contractor'));
  await shot(con.page, '09-contractor-home');
  await con.page.goto(`${BASE}/app/roads`);
  check('Contractor cannot browse the road network', await con.page.getByText('Test Fixture Avenue A').count() === 0);
  await con.page.goto(woUrl);
  await con.page.click('[data-testid=wo-in_progress]');
  await con.page.waitForLoadState('networkidle');
  await con.page.goto(woUrl);
  await rpcForm(con.page, 'wo-log', { p_note: 'Milling completed on eastbound lane (test)', p_progress_pct: '60' });
  await con.page.goto(`${projectUrl}?tab=costs`);
  await con.page.locator('form[data-testid=cost-form] select[name=p_work_order]').selectOption({ index: 1 });
  await rpcForm(con.page, 'cost-form', { p_description: 'Asphalt laid (test)', p_quantity: '118', p_unit: 'm2', p_unit_rate: '210.50', p_cost_date: '2026-11-20' });
  check('Contractor submits actual cost against own work order', (await formMsg(con.page, 'cost-form')) === 'OK');
  await con.page.goto(`${projectUrl}?tab=invoices`);
  await rpcForm(con.page, 'invoice-form', { p_invoice_number: `INV-${run}`, p_invoice_date: '2026-11-21', p_net_amount: '24839', p_tax_amount: '3477.46' });
  await con.page.goto(woUrl);
  await con.page.click('[data-testid=wo-submitted]');
  await con.page.waitForLoadState('networkidle');

  // Engineer/owner accepts; finance approves cost + invoice and pays
  await owner.page.goto(woUrl);
  await owner.page.click('[data-testid=wo-accepted]');
  await owner.page.waitForLoadState('networkidle');
  await fin.page.goto(`${BASE}/app/finance`);
  await shot(fin.page, '10-finance-queue');
  const queueRows = await fin.page.locator('[data-testid=approval-queue] tbody tr').count();
  check('Finance approval queue lists submitted cost item and invoice', queueRows >= 2, String(queueRows));
  for (let i = 0; i < 2; i++) {
    await fin.page.locator('[data-testid=approval-queue] button[value=true]').first().click();
    await fin.page.waitForLoadState('networkidle');
    await fin.page.goto(`${BASE}/app/finance`);
  }
  await fin.page.goto(`${projectUrl}?tab=invoices`);
  await rpcForm(fin.page, 'payment-form', { p_amount: '999999', p_paid_on: '2026-11-25', p_reference: 'TRX-OVER' });
  check('Overpayment rejected with a clear message', (await formMsg(fin.page, 'payment-form')).includes('exceeds'));
  await fin.page.goto(`${projectUrl}?tab=invoices`);
  await rpcForm(fin.page, 'payment-form', { p_amount: '28316.46', p_paid_on: '2026-11-25', p_reference: `TRX-${run}` });
  await fin.page.goto(projectUrl);
  const kpis = await fin.page.locator('[data-testid=project-kpis]').innerText();
  check('Project KPIs show verified actual (24.8K) and paid (28.3K) separately', /24\.8k/i.test(kpis) && /28\.3k/i.test(kpis), kpis.replace(/\n/g, ' | '));
  await shot(fin.page, '05-project-financials', true);

  // ---------------------------------------------------------------- Journey E: executive-style views
  await owner.page.goto(`${BASE}/app/budget-studio`);
  await owner.page.fill('form[data-testid=studio-form] input[name=funding]', '100000');
  await owner.page.click('[data-testid=studio-run]');
  await owner.page.waitForSelector('[data-testid=studio-result]');
  check('Budget studio runs a scenario on real project records', await owner.page.locator('[data-testid=studio-result]').count() === 1);
  await shot(owner.page, '07-budget-studio');
  await owner.page.goto(`${projectUrl}?tab=prediction`);
  check('Cost prediction shows "insufficient verified data" without comparables', await owner.page.getByText('Insufficient verified data').count() > 0);
  const exp = await owner.page.request.get(`${BASE}/api/export/cost_items`);
  check('CSV export returns the verified cost item', exp.ok() && (await exp.text()).includes('Asphalt laid (test)'));

  // Screens
  for (const [name, url] of [['02-overview', '/app'], ['03-map', '/app/map'], ['04-roads', '/app/roads'], ['06-projects', '/app/projects'], ['08-model-center', '/app/model-center'],
    ['11-organization', '/app/organization'], ['12-analytics', '/app/analytics'], ['13-work-orders', '/app/work-orders']]) {
    await owner.page.goto(`${BASE}${url}`, { waitUntil: 'load' }); await owner.page.waitForTimeout(url === '/app/map' ? 3000 : 800); await shot(owner.page, name);
  }

  // ---------------------------------------------------------------- tenant isolation (UI level)
  const other = await newUser('other');
  await signUp(other, 'E2E Other Org Owner');
  await rpcForm(other.page, 'create-org', { p_name: `E2E Other Org ${run}`, p_slug: `e2e-other-${run}` }, 'create-org-submit');
  await other.page.waitForURL(`${BASE}/app`);
  await other.page.goto(projectUrl);
  check('Tenant isolation: another org gets 404 for the project URL', (await other.page.content()).includes('404') || (await other.page.locator('h1').innerText()).includes('404'));
  const csv = await other.page.request.get(`${BASE}/api/export/cost_items`);
  check('Tenant isolation: other org export has no foreign cost items', !(await csv.text()).includes('Asphalt laid (test)'));

  // ---------------------------------------------------------------- i18n / RTL / dark / mobile
  await owner.ctx.addCookies([{ name: 'rs_locale', value: 'ar', url: BASE }, { name: 'rs_theme', value: 'dark', url: BASE }]);
  await owner.page.goto(`${BASE}/app`);
  check('Arabic: html dir=rtl and lang=ar', (await owner.page.getAttribute('html', 'dir')) === 'rtl' && (await owner.page.getAttribute('html', 'lang')) === 'ar');
  check('Dark theme applied from preference', (await owner.page.getAttribute('html', 'data-theme')) === 'dark');
  await shot(owner.page, '14-overview-ar-dark');
  await owner.page.goto(projectUrl); await shot(owner.page, '15-project-ar-dark');
  await owner.ctx.clearCookies({ name: 'rs_theme' });
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await owner.ctx.storageState() });
  const mp = await mob.newPage();
  await mp.goto(`${BASE}/app`);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('390px mobile: no horizontal page scroll on overview', overflow <= 1, `overflow ${overflow}px`);
  await shot(mp, '16-overview-mobile-ar');

  const pageErrors = [owner, fin, con, other, anon, admin].flatMap((u) => u.errors);
  check('No uncaught browser errors during journeys', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('Journey completed without exceptions', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\nE2E: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
