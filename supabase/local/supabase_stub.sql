-- Minimal stand-in for the Supabase platform schemas so migrations and SQL tests
-- can run against a plain PostgreSQL 16+/PostGIS server (CI and local development).
-- NOT used in production: Supabase provides the real auth/storage/net schemas.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists net;
grant usage on schema extensions, auth, storage to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text unique,
  encrypted_password text, raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated;

create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint
language sql as $$ select 0::bigint $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
