// RoadShield local dev/test gateway — NOT FOR PRODUCTION.
// Implements the subset of the Supabase Auth (GoTrue) and PostgREST HTTP APIs used by the
// RoadShield web app, on top of a local Postgres that has the RoadShield migrations applied.
// Every data request runs inside a transaction with `set local role` + `request.jwt.claims`,
// exactly like PostgREST, so row level security and RPC role checks are really exercised.
//
// Env: DATABASE_URL (postgres://postgres:postgres@localhost/roadshield_local), PORT (54321),
//      JWT_SECRET (any string; local only).
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

const PORT = Number(process.env.PORT ?? 54321);
const SECRET = process.env.JWT_SECRET ?? 'roadshield-local-dev-secret-not-for-production';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost/roadshield_local', max: 10 });
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric -> JSON number, as PostgREST does

const b64u = (b) => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verifyJwt(token) {
  try {
    const [h, p, s] = token.split('.');
    const exp = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch { return null; }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

const refreshTokens = new Map();
async function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now });
  const refresh_token = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refresh_token, user.id);
  return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: userJson(user) };
}
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: 'email' }, created_at: u.created_at, updated_at: u.updated_at });

async function auth(req, res, url, body) {
  const path = url.pathname.replace('/auth/v1', '');
  if (path === '/signup' && req.method === 'POST') {
    if (!body.email || !body.password || body.password.length < 6) return send(res, 422, { code: 422, msg: 'invalid', error_code: 'validation_failed' });
    const { rows } = await pool.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower($1),
               extensions.crypt($2, extensions.gen_salt('bf')), $3, now())
       on conflict (email) do nothing returning *`, [body.email, body.password, body.data ?? {}]);
    if (!rows[0]) return send(res, 422, { code: 422, msg: 'User already registered', error_code: 'user_already_exists' });
    return send(res, 200, await session(rows[0]));
  }
  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const { rows } = await pool.query(`select * from auth.users where email = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [body.email ?? '', body.password ?? '']);
      if (!rows[0]) return send(res, 400, { code: 400, error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', error_code: 'invalid_credentials' });
      return send(res, 200, await session(rows[0]));
    }
    if (grant === 'refresh_token') {
      const uid = refreshTokens.get(body.refresh_token);
      if (!uid) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      const { rows } = await pool.query('select * from auth.users where id = $1', [uid]);
      return send(res, 200, await session(rows[0]));
    }
  }
  const claims = verifyJwt((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
  if (path === '/user') {
    if (!claims) return send(res, 401, { code: 401, msg: 'invalid JWT', error_code: 'bad_jwt' });
    if (req.method === 'PUT' && body.password) await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1`, [claims.sub, body.password]);
    const { rows } = await pool.query('select * from auth.users where id = $1', [claims.sub]);
    return rows[0] ? send(res, 200, userJson(rows[0])) : send(res, 404, { code: 404, msg: 'not found' });
  }
  if (path === '/logout') return send(res, 204);
  if (path === '/recover') return send(res, 200, {});
  return send(res, 404, { code: 404, msg: 'not implemented in dev gateway' });
}

async function withRole(req, fn) {
  const claims = verifyJwt((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`,
      [JSON.stringify(claims ?? { role: 'anon' }), claims ? 'authenticated' : 'anon']);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally { client.release(); }
}

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error('bad identifier'), { code: 'PGRST100' }); return `"${s}"`; };
const fnCache = new Map();
async function fnInfo(name) {
  if (fnCache.has(name)) return fnCache.get(name);
  const { rows } = await pool.query(
    `select p.proretset, t.typname as rettype, p.prorettype = 'pg_catalog.record'::regtype or t.typtype = 'c' as composite,
            coalesce(p.proargnames, '{}') as names, coalesce(p.proargmodes::text[], '{}') as modes,
            array(select format_type(x, null) from unnest(p.proargtypes) x) as types
     from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1`, [name]);
  fnCache.set(name, rows[0] ?? null);
  return rows[0] ?? null;
}

async function rpc(req, res, name, args) {
  const info = await fnInfo(name);
  if (!info) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}` });
  const inNames = info.names.filter((_, i) => !info.modes.length || ['i', 'b'].includes(info.modes[i]));
  const parts = []; const vals = [];
  for (const [k, v] of Object.entries(args ?? {})) {
    const idx = inNames.indexOf(k);
    if (idx < 0) return send(res, 404, { code: 'PGRST202', message: `unknown argument ${k}` });
    const type = info.types[idx];
    vals.push(v === null ? null : type === 'jsonb' || type === 'json' ? JSON.stringify(v) : Array.isArray(v) ? `{${v.join(',')}}` : typeof v === 'object' ? JSON.stringify(v) : String(v));
    parts.push(`${ident(k)} => $${vals.length}::${type}`);
  }
  const call = `public.${ident(name)}(${parts.join(', ')})`;
  const sql = info.proretset || info.composite ? `select * from ${call}` : `select ${call} as r`;
  const rows = await withRole(req, async (c) => (await c.query(sql, vals)).rows);
  if (info.proretset || info.composite) return send(res, 200, info.proretset ? rows : rows[0] ?? null);
  return send(res, 200, rows[0]?.r ?? null);
}

const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
async function table(req, res, url, name) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { code: 'PGRST', message: 'Writes go through RPCs' });
  const where = []; const vals = []; let order = ''; let limit = ''; let offset = '';
  let cols = '*';
  for (const [k, v] of url.searchParams) {
    if (k === 'select') { cols = v === '*' ? '*' : v.split(',').map((c) => ident(c.trim())).join(', '); continue; }
    if (k === 'order') { order = 'order by ' + v.split(',').map((o) => { const [c, dir, nulls] = o.split('.'); return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`; }).join(', '); continue; }
    if (k === 'limit') { limit = `limit ${Number(v)}`; continue; }
    if (k === 'offset') { offset = `offset ${Number(v)}`; continue; }
    const m = v.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/s);
    if (!m) continue;
    const [, not, op, raw] = m;
    let cond;
    if (op === 'in') { const list = raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); vals.push(list); cond = `${ident(k)}::text = any($${vals.length}::text[])`; }
    else if (op === 'is') cond = `${ident(k)} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`;
    else { vals.push(op.endsWith('like') ? raw.replace(/\*/g, '%') : raw); cond = `${ident(k)}::text ${OPS[op]} $${vals.length}`; }
    where.push(not ? `not (${cond})` : cond);
  }
  const sql = `select ${cols} from public.${ident(name)} ${where.length ? 'where ' + where.join(' and ') : ''} ${order} ${limit} ${offset}`;
  const wantCount = /count=exact/.test(req.headers.prefer ?? '');
  const { rows, total } = await withRole(req, async (c) => {
    const r = (await c.query(sql, vals)).rows;
    const t = wantCount ? (await c.query(`select count(*)::int n from public.${ident(name)} ${where.length ? 'where ' + where.join(' and ') : ''}`, vals)).rows[0].n : null;
    return { rows: r, total: t };
  });
  const headers = wantCount ? { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${total}` } : {};
  if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
    if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
    return send(res, 200, rows[0], headers);
  }
  return send(res, 200, req.method === 'HEAD' ? undefined : rows, headers);
}

// ---------------------------------------------------------------- storage (local subset)
// Objects live under the OS temp dir; metadata rows go into storage.objects as the calling user,
// so the storage RLS policies from the migrations decide what may be written and read.
const STORE = nodePath.join(os.tmpdir(), 'roadshield-local-storage');
const readRaw = (req) => new Promise((r) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => r(Buffer.concat(chunks))); });
const objPath = (bucket, name) => {
  const p = nodePath.join(STORE, bucket, name);
  if (!p.startsWith(nodePath.join(STORE, bucket) + nodePath.sep)) throw Object.assign(new Error('invalid path'), { code: '22023' });
  return p;
};
const signToken = (bucket, name, exp) => crypto.createHmac('sha256', SECRET).update(`${bucket}/${name}:${exp}`).digest('base64url');
async function storageApi(req, res, url) {
  const rest = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ''));
  if (req.method === 'GET' && rest.startsWith('sign/')) {
    const [bucket, ...parts] = rest.slice(5).split('/'); const name = parts.join('/');
    const exp = Number(url.searchParams.get('exp')); const token = url.searchParams.get('token') ?? '';
    if (!exp || exp < Date.now() / 1000 || token !== signToken(bucket, name, exp)) return send(res, 400, { message: 'invalid signature' });
    const meta = (await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rows[0];
    if (!meta) return send(res, 404, { message: 'not found' });
    res.writeHead(200, { 'content-type': meta.metadata?.mimetype ?? 'application/octet-stream' });
    return res.end(fs.readFileSync(objPath(bucket, name)));
  }
  if (req.method === 'POST' && rest.startsWith('sign/')) {
    const body = await readBody(req);
    const [bucket, ...parts] = rest.slice(5).split('/'); const name = parts.join('/');
    const found = await withRole(req, async (c) => (await c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])).rowCount);
    if (!found) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const exp = Math.floor(Date.now() / 1000) + Math.min(Number(body.expiresIn ?? 60), 3600);
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=${signToken(bucket, name, exp)}&exp=${exp}` });
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const [bucket, ...parts] = rest.split('/'); const name = parts.join('/');
    const data = await readRaw(req);
    const mime = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0];
    const b = (await pool.query('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [bucket])).rows[0];
    if (!b) return send(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if ((b.file_size_limit && data.length > Number(b.file_size_limit)) || (b.allowed_mime_types && !b.allowed_mime_types.includes(mime))) {
      return send(res, 400, { statusCode: '413', error: 'invalid', message: 'size or mime type not allowed' });
    }
    const id = await withRole(req, async (c) => (await c.query(
      `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), jsonb_build_object('mimetype', $3::text, 'size', $4::int)) returning id`,
      [bucket, name, mime, data.length])).rows[0].id);
    fs.mkdirSync(nodePath.dirname(objPath(bucket, name)), { recursive: true });
    fs.writeFileSync(objPath(bucket, name), data);
    return send(res, 200, { Key: `${bucket}/${name}`, Id: id });
  }
  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const bucket = rest.split('/')[0];
    const deleted = await withRole(req, async (c) => (await c.query(
      'delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, body.prefixes ?? []])).rows);
    deleted.forEach((r) => fs.rmSync(objPath(bucket, r.name), { force: true }));
    return send(res, 200, deleted.map((r) => ({ name: r.name })));
  }
  return send(res, 405, { message: 'method not allowed' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204);
  try {
    if (url.pathname.startsWith('/storage/v1/object/')) return await storageApi(req, res, url);
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url, body);
    const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)$/);
    if (m && m[1]) return await rpc(req, res, m[2], body);
    if (m) return await table(req, res, url, m[2]);
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    const status = e.code === '42501' ? 403 : 400;
    return send(res, status, { code: e.code ?? 'PGRST', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
}).listen(PORT, () => console.log(`RoadShield dev gateway on http://localhost:${PORT} (local testing only)`));
