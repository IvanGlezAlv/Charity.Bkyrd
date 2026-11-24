-- Bibs handed out at kit pickup did not always match the registered list, so
-- a runner's guest list is now saved even when bib + name don't match. The
-- typed bib is kept and the submission is flagged for the organizers.

alter table public.crew_submissions
  add column is_runner boolean not null default false,
  add column typed_bib text check (length(typed_bib) <= 20);

update public.crew_submissions s
set is_runner = true, typed_bib = r.bib
from public.registrations r
where r.id = s.registration_id;

-- Same as before, except a runner whose bib + name don't match is saved with
-- no registration (registration_id null, is_runner true) instead of rejected.
create or replace function public.submit_guest_list(
  p_race_id uuid, p_is_runner boolean, p_bib text, p_name text, p_with_runner text,
  p_guests text[], p_cars integer, p_plates text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runner boolean := coalesce(p_is_runner, false);
  v_reg uuid;
  v_bib text := nullif(left(trim(coalesce(p_bib, '')), 20), '');
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_with text := nullif(regexp_replace(trim(coalesce(p_with_runner, '')), '\s+', ' ', 'g'), '');
  v_plates text := nullif(regexp_replace(trim(coalesce(p_plates, '')), '\s+', ' ', 'g'), '');
  v_guests text[];
  v_id uuid;
begin
  if not public.race_is_public(p_race_id) then
    raise exception 'Race not found';
  end if;
  if v_runner then
    begin
      v_reg := public.match_runner(p_race_id, v_bib, v_name);
    exception when others then
      v_reg := null; -- saved anyway and flagged as a mismatch
    end;
    v_with := null;
  else
    v_bib := null;
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
  insert into public.crew_submissions (race_id, registration_id, is_runner, typed_bib, submitter_name, with_runner, cars, plates)
  values (p_race_id, v_reg, v_runner, v_bib, v_name, v_with, p_cars, v_plates)
  returning id into v_id;
  insert into public.crew_submission_guests (submission_id, race_id, position, full_name)
  select v_id, p_race_id, o, g from unnest(v_guests) with ordinality as t(g, o);

  return cardinality(v_guests);
end;
$$;
