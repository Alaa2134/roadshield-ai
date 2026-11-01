-- RoadShield AI — core schema
-- Extensions, private schema, enums and tables.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema: never exposed through the Data API.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.user_role as enum ('citizen', 'maintenance_officer', 'admin');

create type public.hazard_category as enum (
  'pothole', 'crack', 'surface_damage', 'flooding',
  'damaged_signage', 'obstruction', 'street_lighting', 'other'
);

create type public.hazard_severity as enum ('low', 'medium', 'high', 'critical');

create type public.report_status as enum (
  'submitted', 'under_review', 'verified', 'assigned', 'in_progress',
  'resolved', 'rejected', 'duplicate', 'reopened'
);

create type public.task_status as enum (
  'assigned', 'in_progress', 'completion_requested', 'completed', 'cancelled'
);

create type public.notification_type as enum (
  'report_confirmation', 'verification_update', 'nearby_hazard',
  'maintenance_progress', 'report_resolved', 'system_announcement'
);

create type public.image_kind as enum ('report', 'additional', 'before', 'after');

-- ---------------------------------------------------------------- private tables
create table app_private.settings (
  key text primary key,
  value text not null
);

create table app_private.admin_bootstrap_emails (
  email text primary key check (email = lower(email))
);

create table app_private.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup_idx on app_private.rate_events (user_id, action, created_at desc);

-- ---------------------------------------------------------------- profiles & roles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  avatar_path text check (char_length(avatar_path) <= 300),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  home_city text check (char_length(home_city) <= 80),
  notify_status_updates boolean not null default true,
  notify_nearby boolean not null default true,
  notify_announcements boolean not null default true,
  nearby_radius_m integer not null default 1000 check (nearby_radius_m between 100 and 10000),
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.user_role not null default 'citizen',
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);
create index user_roles_role_idx on public.user_roles (role);

-- ---------------------------------------------------------------- hazards
create sequence public.hazard_code_seq;

create table public.ai_detections (
  id uuid primary key,
  requested_by uuid references public.profiles (id) on delete set null,
  model_name text not null check (char_length(model_name) <= 100),
  model_version text not null check (char_length(model_version) <= 100),
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  top_category public.hazard_category,
  top_confidence real check (top_confidence between 0 and 1),
  detections jsonb not null default '[]'::jsonb,
  inference_ms integer,
  signature_verified boolean not null default false,
  user_accepted_category boolean,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.hazards (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  reporter_id uuid references public.profiles (id) on delete set null,
  client_draft_id uuid,
  category public.hazard_category not null,
  severity public.hazard_severity not null,
  description text not null default '' check (char_length(description) <= 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) not null,
  location_source text not null default 'gps' check (location_source in ('gps', 'manual')),
  location_accuracy_m real check (location_accuracy_m >= 0),
  address text check (char_length(address) <= 200),
  city text check (char_length(city) <= 80),
  status public.report_status not null default 'submitted',
  duplicate_of uuid references public.hazards (id) on delete set null,
  traffic_exposure smallint check (traffic_exposure between 1 and 5),
  confirmations_count integer not null default 0 check (confirmations_count >= 0),
  ai_detection_id uuid references public.ai_detections (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hazards_client_draft_unique unique (reporter_id, client_draft_id),
  constraint hazards_not_self_duplicate check (duplicate_of is null or duplicate_of <> id)
);
create index hazards_location_idx on public.hazards using gist (location);
create index hazards_status_idx on public.hazards (status, created_at desc);
create index hazards_reporter_idx on public.hazards (reporter_id, created_at desc);
create index hazards_city_idx on public.hazards (city);

alter table public.ai_detections
  add column hazard_id uuid references public.hazards (id) on delete cascade;
create index ai_detections_hazard_idx on public.ai_detections (hazard_id);

create table public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  hazard_id uuid not null references public.hazards (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_by uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'assigned',
  due_date date,
  started_at timestamptz,
  completion_requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index maintenance_tasks_one_open_idx on public.maintenance_tasks (hazard_id)
  where status in ('assigned', 'in_progress', 'completion_requested');
create index maintenance_tasks_assignee_idx on public.maintenance_tasks (assigned_to, status);

create table public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.maintenance_tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  status public.task_status,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index task_updates_task_idx on public.task_updates (task_id, created_at);

create table public.hazard_images (
  id uuid primary key default gen_random_uuid(),
  hazard_id uuid not null references public.hazards (id) on delete cascade,
  task_id uuid references public.maintenance_tasks (id) on delete set null,
  uploader_id uuid references public.profiles (id) on delete set null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  kind public.image_kind not null default 'report',
  privacy_blurred boolean not null default false,
  privacy_approved boolean not null default false,
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now()
);
create index hazard_images_hazard_idx on public.hazard_images (hazard_id);

create table public.hazard_confirmations (
  hazard_id uuid not null references public.hazards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  still_present boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (hazard_id, user_id)
);
create index hazard_confirmations_user_idx on public.hazard_confirmations (user_id);

create table public.status_history (
  id bigint generated always as identity primary key,
  hazard_id uuid not null references public.hazards (id) on delete cascade,
  from_status public.report_status,
  to_status public.report_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index status_history_hazard_idx on public.status_history (hazard_id, created_at);

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title_en text not null,
  body_en text not null,
  title_ar text not null,
  body_ar text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_status text not null default 'pending'
    check (push_status in ('pending', 'sent', 'failed', 'skipped', 'no_tokens')),
  push_error text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (char_length(token) <= 255),
  platform text not null check (platform in ('ios', 'android')),
  device_name text check (char_length(device_name) <= 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index device_push_tokens_user_idx on public.device_push_tokens (user_id);

-- ---------------------------------------------------------------- saved locations
create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default now()
);
create index saved_locations_user_idx on public.saved_locations (user_id);
create index saved_locations_location_idx on public.saved_locations using gist (location);

-- ---------------------------------------------------------------- audit
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
