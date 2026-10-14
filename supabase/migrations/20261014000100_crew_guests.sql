-- Crew / guests each runner brings to the venue. Runners submit the list from
-- the public site (/invitados) with their bib and name; organizers export it
-- to generate entry QR codes. Guest names are never readable by the public.
create table public.crew_guests (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  registration_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  position smallint not null,
  -- A resubmission overwrites positions in place and switches off the rest,
  -- so no guest row is ever deleted.
  active boolean not null default true,
  submitted_at timestamptz not null default now(),
  unique (registration_id, position),
  foreign key (race_id, registration_id) references public.registrations (race_id, id) on delete cascade
);
create index crew_guests_race_idx on public.crew_guests (race_id, registration_id);

alter table public.crew_guests enable row level security;
revoke all on public.crew_guests from anon;
revoke insert, update, delete, truncate on public.crew_guests from authenticated;
create policy crew_guests_select on public.crew_guests for select to authenticated
  using (public.has_role('organizer'));

create trigger audit_changes after insert or update or delete on public.crew_guests
  for each row execute function public.audit_row_change();

-- Lowercase, accents stripped, punctuation turned into spaces.
create or replace function public.name_words(p text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(w), '{}') from regexp_split_to_table(
    regexp_replace(translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]+', ' ', 'g'),
    ' ') w
  where length(w) >= 3
$$;

-- Replaces the runner's guest list. The bib must belong to the race and the
-- name must share at least one word with the runner's registered name, so a
-- guessed bib alone is not enough. Returns the number of guests saved.
create or replace function public.submit_crew_guests(p_race_id uuid, p_bib text, p_runner_name text, p_guests text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg uuid;
  v_first text;
  v_last text;
  v_guests text[];
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

  select coalesce(array_agg(g order by o), '{}') into v_guests
  from (
    select regexp_replace(trim(g), '\s+', ' ', 'g') g, o
    from unnest(coalesce(p_guests, '{}')) with ordinality as t(g, o)
  ) s
  where length(g) > 0;

  if cardinality(v_guests) = 0 then
    raise exception 'At least one guest is required';
  end if;
  if cardinality(v_guests) > 15 then
    raise exception 'Too many guests';
  end if;
  if exists (select 1 from unnest(v_guests) g where length(g) < 2 or length(g) > 120) then
    raise exception 'Invalid guest name';
  end if;

  perform set_config('app.audit_reason', 'Lista de invitados enviada desde /invitados', true);
  update public.crew_guests set active = false where registration_id = v_reg and active;
  insert into public.crew_guests (race_id, registration_id, full_name, position)
  select p_race_id, v_reg, g, o from unnest(v_guests) with ordinality as t(g, o)
  on conflict (registration_id, position)
  do update set full_name = excluded.full_name, active = true, submitted_at = now();

  return cardinality(v_guests);
end;
$$;

revoke all on function public.submit_crew_guests(uuid, text, text, text[]) from public;
grant execute on function public.submit_crew_guests(uuid, text, text, text[]) to anon, authenticated;
