-- =============================================================================
-- Core schema: races, content, courses, participants, timing, results, audit.
--
-- Conventions
--   * Every timestamp is timestamptz (stored in UTC). Each race has an IANA
--     timezone used only for display and for interpreting local-time imports.
--   * Timing events are the source of truth for recorded passages. The
--     race_results table is a derived cache maintained exclusively by
--     public.recalculate_results() (see the timing migration).
--   * Personal data lives in participants (private). Public pages read from
--     the public_* views, which expose an explicit allow-list of columns.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'organizer', 'timer');
create type public.race_format as enum ('backyard', 'fixed_distance');
create type public.event_status as enum ('upcoming', 'race_day', 'results_pending', 'results_published', 'completed');
create type public.results_publication as enum ('hidden', 'provisional', 'official');
create type public.participation_status as enum ('registered', 'started', 'finished', 'dns', 'dnf', 'dsq');
create type public.timing_kind as enum ('start', 'lap', 'checkpoint', 'finish');
create type public.timing_source as enum ('manual', 'csv', 'chip', 'api');
create type public.location_kind as enum ('venue', 'start', 'finish', 'parking', 'packet_pickup', 'aid_station', 'accommodation', 'other');
create type public.content_page as enum ('home', 'info', 'manual');
create type public.document_kind as enum ('manual_pdf', 'gpx', 'image', 'other');
create type public.contact_kind as enum ('organizer', 'emergency', 'medical', 'other');
create type public.announcement_severity as enum ('info', 'important', 'urgent');
create type public.checkpoint_kind as enum ('aid_station', 'checkpoint', 'timing_point');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return tz is not null and length(tz) > 0;
exception when others then
  return false;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff accounts and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Races
-- ---------------------------------------------------------------------------
create table public.races (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  tagline text,
  description text,
  format public.race_format not null default 'backyard',
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  event_date date,
  event_status public.event_status not null default 'upcoming',
  results_publication public.results_publication not null default 'hidden',
  results_published_at timestamptz,
  results_published_by uuid references auth.users (id) on delete set null,
  is_published boolean not null default false,
  registration_note text not null default 'Registration is closed.',
  venue_name text,
  address text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  logo_path text,
  hero_image_path text,
  contact_email text,
  contact_phone text,
  -- [{ "label": "Instagram", "url": "https://instagram.com/..." }]
  social_links jsonb not null default '[]'::jsonb check (jsonb_typeof(social_links) = 'array'),
  -- 'gun': elapsed from the distance's official start. 'net': from the runner's own start event.
  ranking_basis text not null default 'gun' check (ranking_basis in ('gun', 'net')),
  manual_version text,
  manual_updated_at timestamptz,
  manual_pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  kind public.location_kind not null,
  name text not null,
  description text,
  address text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  sort_order int not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, id)
);
create index locations_race_idx on public.locations (race_id, sort_order);

create table public.race_distances (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  distance_km numeric(7, 3) check (distance_km > 0),
  elevation_gain_m int check (elevation_gain_m >= 0),
  elevation_loss_m int check (elevation_loss_m >= 0),
  description text,
  instructions text,
  start_location_id uuid,
  finish_location_id uuid,
  -- Official (gun) start. For backyard races this is the start of yard 1.
  start_time timestamptz,
  -- Fixed-distance overall cutoff, in minutes from start_time.
  cutoff_minutes int check (cutoff_minutes > 0),
  -- Backyard: time allowed per loop (a new yard starts every interval).
  loop_interval_minutes int check (loop_interval_minutes > 0),
  gpx_path text,
  gpx_filename text,
  -- Derived from the uploaded GPX file only; never typed in by hand.
  route_geojson jsonb,
  elevation_profile jsonb,
  gpx_stats jsonb,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, slug),
  unique (race_id, id),
  foreign key (race_id, start_location_id) references public.locations (race_id, id) on delete set null (start_location_id),
  foreign key (race_id, finish_location_id) references public.locations (race_id, id) on delete set null (finish_location_id)
);

create table public.race_categories (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  name text not null,
  gender text check (gender in ('F', 'M', 'X')),
  min_age int check (min_age >= 0),
  max_age int check (max_age >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, code),
  unique (race_id, id),
  check (min_age is null or max_age is null or min_age <= max_age)
);

create table public.course_checkpoints (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null,
  distance_id uuid not null,
  name text not null,
  kind public.checkpoint_kind not null default 'checkpoint',
  km_mark numeric(7, 3) check (km_mark >= 0),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  sort_order int not null default 0,
  cutoff_minutes int check (cutoff_minutes > 0),
  -- When true, staff are expected to record a passage here; missing passages are flagged for review.
  is_timed boolean not null default false,
  services text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, id),
  unique (distance_id, id),
  foreign key (race_id, distance_id) references public.race_distances (race_id, id) on delete cascade
);
create index course_checkpoints_distance_idx on public.course_checkpoints (distance_id, sort_order);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.content_sections (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  page public.content_page not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  body text not null default '',
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, page, slug)
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  distance_id uuid,
  location_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  foreign key (race_id, distance_id) references public.race_distances (race_id, id) on delete cascade,
  foreign key (race_id, location_id) references public.locations (race_id, id) on delete set null (location_id)
);
create index schedule_items_race_idx on public.schedule_items (race_id, starts_at);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  kind public.contact_kind not null default 'organizer',
  name text not null,
  role text,
  phone text,
  email text,
  notes text,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  name text not null,
  tier text,
  logo_path text,
  website_url text check (website_url is null or website_url ~* '^https?://'),
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  title text not null,
  body text not null default '',
  severity public.announcement_severity not null default 'info',
  is_pinned boolean not null default false,
  -- Null means draft.
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_race_idx on public.announcements (race_id, published_at desc);

-- Team media, e.g. the La Charity Endurance Team podcast episodes.
create table public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  episode_number int check (episode_number > 0),
  title text not null,
  description text,
  cover_path text,
  listen_url text check (listen_url is null or listen_url ~* '^https?://'),
  published_on date,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  kind public.document_kind not null,
  title text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  version text,
  is_public boolean not null default true,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Participants (private) and their race entries
-- ---------------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null default '',
  email text,
  phone text,
  birth_date date,
  gender text check (gender in ('F', 'M', 'X')),
  nationality text,
  city text,
  club text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_notes text,
  internal_notes text,
  -- Identifier from the organizers' registration system; used to match rows on re-import.
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, id)
);
create unique index participants_external_ref_uidx on public.participants (race_id, external_ref) where external_ref is not null;
create index participants_name_idx on public.participants (race_id, lower(last_name), lower(first_name));

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  participant_id uuid not null,
  distance_id uuid not null,
  category_id uuid,
  bib text check (bib ~ '^[A-Za-z0-9-]{1,12}$'),
  status public.participation_status not null default 'registered',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users (id) on delete set null,
  -- Runner agreed to appear in public lists and results.
  public_listing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, id),
  unique (race_id, participant_id),
  unique (race_id, bib),
  foreign key (race_id, participant_id) references public.participants (race_id, id) on delete cascade,
  foreign key (race_id, distance_id) references public.race_distances (race_id, id) on delete restrict,
  foreign key (race_id, category_id) references public.race_categories (race_id, id) on delete set null (category_id)
);
create index registrations_distance_idx on public.registrations (distance_id, status);

-- ---------------------------------------------------------------------------
-- Timing events: one row per recorded passage. Corrections never delete rows;
-- they void the old row (with reason and actor) and insert a replacement.
-- ---------------------------------------------------------------------------
create table public.timing_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null,
  registration_id uuid not null,
  kind public.timing_kind not null,
  lap_number int check (lap_number > 0),
  checkpoint_id uuid,
  recorded_at timestamptz not null,
  source public.timing_source not null default 'manual',
  device_id text,
  -- Idempotency key generated by the client; a retried submission returns the original row.
  client_event_id uuid unique,
  note text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  replaced_by uuid references public.timing_events (id) on delete set null,
  foreign key (race_id, registration_id) references public.registrations (race_id, id) on delete cascade,
  foreign key (race_id, checkpoint_id) references public.course_checkpoints (race_id, id) on delete restrict,
  check (case kind
    when 'lap' then lap_number is not null and checkpoint_id is null
    when 'checkpoint' then checkpoint_id is not null
    else lap_number is null and checkpoint_id is null
  end),
  check ((voided_at is null) = (void_reason is null))
);

-- At most one active (non-voided) event per runner per passage.
create unique index timing_events_active_uidx on public.timing_events (
  registration_id,
  kind,
  coalesce(lap_number, 0),
  coalesce(checkpoint_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where voided_at is null;
create index timing_events_race_idx on public.timing_events (race_id, recorded_at desc) where voided_at is null;

-- ---------------------------------------------------------------------------
-- Derived results (maintained by public.recalculate_results only)
-- ---------------------------------------------------------------------------
create table public.race_results (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  race_id uuid not null references public.races (id) on delete cascade,
  distance_id uuid not null references public.race_distances (id) on delete cascade,
  category_id uuid references public.race_categories (id) on delete set null,
  gender text,
  status public.participation_status not null,
  laps_completed int not null default 0,
  start_at timestamptz,
  finish_at timestamptz,
  gun_elapsed_ms bigint,
  net_elapsed_ms bigint,
  ranking_elapsed_s bigint,
  overall_rank int,
  category_rank int,
  gender_rank int,
  splits jsonb not null default '[]'::jsonb,
  flags text[] not null default '{}',
  computed_at timestamptz not null default now()
);
create index race_results_board_idx on public.race_results (race_id, distance_id, overall_rank);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  race_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_race_idx on public.audit_logs (race_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','races','locations','race_distances','race_categories','course_checkpoints',
    'content_sections','schedule_items','faqs','contacts','sponsors','announcements','documents',
    'podcast_episodes','participants','registrations']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
