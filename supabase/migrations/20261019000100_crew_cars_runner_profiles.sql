-- Cars each runner's crew brings (for venue access) and a short runner
-- profile for the livestream commentators. Both are submitted from the public
-- site without an account, using bib + name like /invitados, and are readable
-- only by organizers. Writes are upserts so no row is ever deleted.

-- Finds the runner a public form is about: the bib must belong to the race
-- and the name must share at least one word with the registered name.
-- Not granted to the public; only the submit functions below call it.
create or replace function public.match_runner(p_race_id uuid, p_bib text, p_runner_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reg uuid;
  v_first text;
  v_last text;
begin
  if not public.race_is_public(p_race_id) then
    raise exception 'Race not found';
  end if;
  select r.id, p.first_name, p.last_name into v_reg, v_first, v_last
  from public.registrations r
  join public.participants p on p.race_id = r.race_id and p.id = r.participant_id
  where r.race_id = p_race_id
    and r.bib is not null
    and ltrim(r.bib, '0') = ltrim(trim(coalesce(p_bib, '')), '0')
    and r.status not in ('dsq');
  if v_reg is null or not (public.name_words(p_runner_name) && public.name_words(v_first || ' ' || v_last)) then
    raise exception 'Bib and name do not match';
  end if;
  return v_reg;
end;
$$;
revoke all on function public.match_runner(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crew cars
-- ---------------------------------------------------------------------------
create table public.crew_cars (
  registration_id uuid primary key,
  race_id uuid not null references public.races (id) on delete cascade,
  cars smallint not null check (cars between 0 and 10),
  plates text check (length(plates) <= 300),
  updated_at timestamptz not null default now(),
  foreign key (race_id, registration_id) references public.registrations (race_id, id) on delete cascade
);
alter table public.crew_cars enable row level security;
revoke all on public.crew_cars from anon;
revoke insert, update, delete, truncate on public.crew_cars from authenticated;
create policy crew_cars_select on public.crew_cars for select to authenticated
  using (public.has_role('organizer'));
create trigger audit_changes after insert or update or delete on public.crew_cars
  for each row execute function public.audit_row_change();

-- Guest list plus car count in one call. Returns the number of guests saved.
create or replace function public.submit_crew(p_race_id uuid, p_bib text, p_runner_name text, p_guests text[], p_cars integer, p_plates text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg uuid := public.match_runner(p_race_id, p_bib, p_runner_name);
  v_count integer;
  v_plates text := nullif(regexp_replace(trim(coalesce(p_plates, '')), '\s+', ' ', 'g'), '');
begin
  if p_cars is null or p_cars < 0 or p_cars > 10 then
    raise exception 'Invalid car count';
  end if;
  if length(v_plates) > 300 then
    raise exception 'Plates too long';
  end if;
  v_count := public.submit_crew_guests(p_race_id, p_bib, p_runner_name, p_guests);
  insert into public.crew_cars (registration_id, race_id, cars, plates)
  values (v_reg, p_race_id, p_cars, v_plates)
  on conflict (registration_id)
  do update set cars = excluded.cars, plates = excluded.plates, updated_at = now();
  return v_count;
end;
$$;
revoke all on function public.submit_crew(uuid, text, text, text[], integer, text) from public;
grant execute on function public.submit_crew(uuid, text, text, text[], integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Runner profiles for the livestream commentators
-- ---------------------------------------------------------------------------
create table public.runner_profiles (
  registration_id uuid primary key,
  race_id uuid not null references public.races (id) on delete cascade,
  hometown text,
  occupation text,
  running_since text,
  experience text,
  highlights text,
  goal text,
  why_running text,
  fun_fact text,
  instagram text,
  updated_at timestamptz not null default now(),
  foreign key (race_id, registration_id) references public.registrations (race_id, id) on delete cascade
);
alter table public.runner_profiles enable row level security;
revoke all on public.runner_profiles from anon;
revoke insert, update, delete, truncate on public.runner_profiles from authenticated;
create policy runner_profiles_select on public.runner_profiles for select to authenticated
  using (public.has_role('organizer'));
create trigger audit_changes after insert or update or delete on public.runner_profiles
  for each row execute function public.audit_row_change();

-- p_profile is a JSON object with the text fields above; missing or blank
-- fields are stored as null. A resubmission replaces the whole profile.
create or replace function public.submit_runner_profile(p_race_id uuid, p_bib text, p_runner_name text, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg uuid := public.match_runner(p_race_id, p_bib, p_runner_name);
  v_short text[] := array['hometown', 'occupation', 'running_since', 'goal', 'instagram'];
  v_long text[] := array['experience', 'highlights', 'why_running', 'fun_fact'];
  k text;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid profile';
  end if;
  foreach k in array v_short loop
    if length(p_profile ->> k) > 200 then raise exception 'Profile field too long'; end if;
  end loop;
  foreach k in array v_long loop
    if length(p_profile ->> k) > 1500 then raise exception 'Profile field too long'; end if;
  end loop;
  if not exists (select 1 from jsonb_each_text(p_profile) e where e.key = any (v_short || v_long) and length(trim(e.value)) > 0) then
    raise exception 'Profile is empty';
  end if;

  perform set_config('app.audit_reason', 'Perfil enviado desde /perfil', true);
  insert into public.runner_profiles (registration_id, race_id, hometown, occupation, running_since, experience, highlights, goal, why_running, fun_fact, instagram)
  values (
    v_reg, p_race_id,
    nullif(trim(p_profile ->> 'hometown'), ''),
    nullif(trim(p_profile ->> 'occupation'), ''),
    nullif(trim(p_profile ->> 'running_since'), ''),
    nullif(trim(p_profile ->> 'experience'), ''),
    nullif(trim(p_profile ->> 'highlights'), ''),
    nullif(trim(p_profile ->> 'goal'), ''),
    nullif(trim(p_profile ->> 'why_running'), ''),
    nullif(trim(p_profile ->> 'fun_fact'), ''),
    nullif(ltrim(trim(p_profile ->> 'instagram'), '@'), '')
  )
  on conflict (registration_id) do update set
    hometown = excluded.hometown, occupation = excluded.occupation, running_since = excluded.running_since,
    experience = excluded.experience, highlights = excluded.highlights, goal = excluded.goal,
    why_running = excluded.why_running, fun_fact = excluded.fun_fact, instagram = excluded.instagram,
    updated_at = now();
end;
$$;
revoke all on function public.submit_runner_profile(uuid, text, text, jsonb) from public;
grant execute on function public.submit_runner_profile(uuid, text, text, jsonb) to anon, authenticated;
