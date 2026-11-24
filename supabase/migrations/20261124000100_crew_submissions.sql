-- Guest lists for the access list at the caseta of Las Riberas, version 2.
--
-- Before: one list per runner; a new submission replaced the previous one.
-- Now: every submission is kept as its own row. Runners submit with bib + name
-- (verified like before); people who are not running submit with their own
-- name and, optionally, the runner they come with. Up to 30 guests per
-- submission. crew_guests and crew_cars stay as read-only history.

create table public.crew_submissions (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  -- Set when a runner submitted (bib + name matched); null for non-runners.
  registration_id uuid,
  submitter_name text not null check (length(submitter_name) between 2 and 120),
  -- Non-runners only: who they come with (free text, optional).
  with_runner text check (length(with_runner) <= 120),
  -- Null only on lists recovered from before car counts were asked.
  cars smallint check (cars between 0 and 10),
  plates text check (length(plates) <= 300),
  submitted_at timestamptz not null default now(),
  foreign key (race_id, registration_id) references public.registrations (race_id, id) on delete cascade
);
create index crew_submissions_race_idx on public.crew_submissions (race_id, submitted_at);

create table public.crew_submission_guests (
  submission_id uuid not null references public.crew_submissions (id) on delete cascade,
  race_id uuid not null references public.races (id) on delete cascade,
  position smallint not null,
  full_name text not null check (length(full_name) between 2 and 120),
  primary key (submission_id, position)
);

alter table public.crew_submissions enable row level security;
alter table public.crew_submission_guests enable row level security;
revoke all on public.crew_submissions, public.crew_submission_guests from anon;
revoke insert, update, delete, truncate on public.crew_submissions, public.crew_submission_guests from authenticated;
create policy crew_submissions_select on public.crew_submissions for select to authenticated
  using (public.has_role('organizer'));
create policy crew_submission_guests_select on public.crew_submission_guests for select to authenticated
  using (public.has_role('organizer'));
create trigger audit_changes after insert or update or delete on public.crew_submissions
  for each row execute function public.audit_row_change();
create trigger audit_changes after insert or update or delete on public.crew_submission_guests
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Backfill: rebuild every past submission from the audit log, including the
-- lists that a later submission overwrote. All rows written by one submission
-- share the audit timestamp (one transaction), so (runner, timestamp) is one
-- submission.
-- ---------------------------------------------------------------------------
-- One statement so the generated ids are shared by both inserts.
with backfill as (
  select
    (a.new_data ->> 'registration_id')::uuid as registration_id,
    (a.new_data ->> 'race_id')::uuid as race_id,
    a.created_at,
    (a.new_data ->> 'position')::smallint as position,
    a.new_data ->> 'full_name' as full_name
  from public.audit_logs a
  where a.table_name = 'crew_guests'
    and a.action in ('insert', 'update')
    and (a.new_data ->> 'active')::boolean
),
subs as materialized (
  select gen_random_uuid() as id, b.race_id, b.registration_id, b.created_at,
    left(trim(p.first_name || ' ' || p.last_name), 120) as runner,
    (select c.new_data from public.audit_logs c
     where c.table_name = 'crew_cars' and c.action in ('insert', 'update')
       and (c.new_data ->> 'registration_id')::uuid = b.registration_id
       and c.created_at = b.created_at
     order by c.id desc limit 1) as cars
  from (select distinct race_id, registration_id, created_at from backfill) b
  -- Only runners that still exist.
  join public.registrations r on r.id = b.registration_id and r.race_id = b.race_id
  join public.participants p on p.race_id = r.race_id and p.id = r.participant_id
),
new_subs as (
  insert into public.crew_submissions (id, race_id, registration_id, submitter_name, cars, plates, submitted_at)
  select s.id, s.race_id, s.registration_id, s.runner, (s.cars ->> 'cars')::smallint, s.cars ->> 'plates', s.created_at
  from subs s
  returning id
)
insert into public.crew_submission_guests (submission_id, race_id, position, full_name)
select distinct on (s.id, b.position) s.id, s.race_id, b.position, b.full_name
from backfill b
join subs s on s.registration_id = b.registration_id and s.created_at = b.created_at
order by s.id, b.position;

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------

-- Saves a new guest list; never touches earlier ones. With p_is_runner the
-- bib + name must match a runner (match_runner). Otherwise p_name is the
-- person submitting and p_with_runner who they come with. Returns the number
-- of guests saved.
create or replace function public.submit_guest_list(
  p_race_id uuid, p_is_runner boolean, p_bib text, p_name text, p_with_runner text,
  p_guests text[], p_cars integer, p_plates text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_with text := nullif(regexp_replace(trim(coalesce(p_with_runner, '')), '\s+', ' ', 'g'), '');
  v_plates text := nullif(regexp_replace(trim(coalesce(p_plates, '')), '\s+', ' ', 'g'), '');
  v_guests text[];
  v_id uuid;
begin
  if not public.race_is_public(p_race_id) then
    raise exception 'Race not found';
  end if;
  if coalesce(p_is_runner, false) then
    v_reg := public.match_runner(p_race_id, p_bib, p_name);
    v_with := null;
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Invalid name';
  end if;
  if length(v_with) > 120 then
    raise exception 'Invalid runner name';
  end if;
  if p_cars is null or p_cars < 0 or p_cars > 10 then
    raise exception 'Invalid car count';
  end if;
  if length(v_plates) > 300 then
    raise exception 'Plates too long';
  end if;

  select coalesce(array_agg(g order by o), '{}') into v_guests
  from (
    select regexp_replace(trim(g), '\s+', ' ', 'g') g, o
    from unnest(coalesce(p_guests, '{}')) with ordinality as t(g, o)
  ) s
  where length(g) > 0;

  if cardinality(v_guests) = 0 then
    raise exception 'At least one guest is required';
  end if;
  if cardinality(v_guests) > 30 then
    raise exception 'Too many guests';
  end if;
  if exists (select 1 from unnest(v_guests) g where length(g) < 2 or length(g) > 120) then
    raise exception 'Invalid guest name';
  end if;

  perform set_config('app.audit_reason', 'Lista de invitados enviada desde /invitados', true);
  insert into public.crew_submissions (race_id, registration_id, submitter_name, with_runner, cars, plates)
  values (p_race_id, v_reg, v_name, v_with, p_cars, v_plates)
  returning id into v_id;
  insert into public.crew_submission_guests (submission_id, race_id, position, full_name)
  select v_id, p_race_id, o, g from unnest(v_guests) with ordinality as t(g, o);

  return cardinality(v_guests);
end;
$$;
revoke all on function public.submit_guest_list(uuid, boolean, text, text, text, text[], integer, text) from public;
grant execute on function public.submit_guest_list(uuid, boolean, text, text, text, text[], integer, text) to anon, authenticated;

-- The site deployed before this migration still calls submit_crew; it now
-- adds a runner submission instead of replacing the list.
create or replace function public.submit_crew(p_race_id uuid, p_bib text, p_runner_name text, p_guests text[], p_cars integer, p_plates text)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.submit_guest_list(p_race_id, true, p_bib, p_runner_name, null, p_guests, p_cars, p_plates)
$$;

-- The old overwrite path is no longer callable from the site.
revoke execute on function public.submit_crew_guests(uuid, text, text, text[]) from anon, authenticated;
