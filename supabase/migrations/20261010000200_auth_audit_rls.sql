-- =============================================================================
-- Roles, audit trail, Row Level Security and public views.
--
-- Role model (global to the organization):
--   admin      everything, including staff roles and official results
--   organizer  race content, participants, provisional results review
--   timer      record and correct timing, change runner status
-- An admin implicitly holds every role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so policies can consult user_roles without
-- exposing it, with a pinned search_path.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and (ur.role = p_role or ur.role = 'admin')
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid())
$$;

create or replace function public.can_edit_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('organizer')
$$;

create or replace function public.can_time()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('timer')
$$;

create or replace function public.race_is_public(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.races r where r.id = p_race_id and r.is_published)
$$;

create or replace function public.my_roles()
returns setof public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role from public.user_roles ur where ur.user_id = auth.uid()
$$;

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail. Functions that make sensitive changes set app.audit_reason for
-- the duration of their transaction so the reason lands with the row change.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_race uuid;
  v_record text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  v_race := coalesce(
    (coalesce(v_new, v_old) ->> 'race_id')::uuid,
    case when tg_table_name = 'races' then (coalesce(v_new, v_old) ->> 'id')::uuid end
  );
  v_record := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id');
  insert into public.audit_logs (race_id, actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (v_race, auth.uid(), lower(tg_op), tg_table_name, v_record, v_old, v_new,
          nullif(current_setting('app.audit_reason', true), ''));
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['races','race_distances','race_categories','course_checkpoints',
    'participants','registrations','timing_events','user_roles','documents']
  loop
    execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Result publication can only change through public.set_results_publication().
create or replace function public.guard_results_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.results_publication is distinct from old.results_publication
      or new.results_published_at is distinct from old.results_published_at
      or new.results_published_by is distinct from old.results_published_by)
     and coalesce(current_setting('app.publication_change', true), '') <> 'on' then
    raise exception 'Results publication must be changed with set_results_publication()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_results_publication
  before update on public.races
  for each row execute function public.guard_results_publication();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.races enable row level security;
alter table public.locations enable row level security;
alter table public.race_distances enable row level security;
alter table public.race_categories enable row level security;
alter table public.course_checkpoints enable row level security;
alter table public.content_sections enable row level security;
alter table public.schedule_items enable row level security;
alter table public.faqs enable row level security;
alter table public.contacts enable row level security;
alter table public.sponsors enable row level security;
alter table public.announcements enable row level security;
alter table public.documents enable row level security;
alter table public.podcast_episodes enable row level security;
alter table public.participants enable row level security;
alter table public.registrations enable row level security;
alter table public.timing_events enable row level security;
alter table public.race_results enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users see their own; staff see everyone's (to show who recorded a time).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Roles: readable by the user and admins. Only admins write, never their own rows.
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.has_role('admin') and user_id <> auth.uid());
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.has_role('admin') and user_id <> auth.uid());

-- Races
create policy races_select on public.races for select to anon, authenticated
  using (is_published or public.is_staff());
create policy races_insert on public.races for insert to authenticated
  with check (public.has_role('admin'));
create policy races_update on public.races for update to authenticated
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy races_delete on public.races for delete to authenticated
  using (public.has_role('admin'));

-- Public content tables: readable when the race is published (and the row is
-- published, where the table has that flag); writable by organizers.
do $$
declare
  t text;
  v_filter text;
begin
  foreach t in array array['locations','race_distances','race_categories','course_checkpoints',
    'content_sections','schedule_items','faqs','contacts','sponsors','announcements','documents','podcast_episodes']
  loop
    v_filter := case t
      when 'locations' then 'is_public'
      when 'race_distances' then 'is_published'
      when 'content_sections' then 'is_published'
      when 'faqs' then 'is_published'
      when 'contacts' then 'is_public'
      when 'sponsors' then 'is_published'
      when 'podcast_episodes' then 'is_published'
      when 'documents' then 'is_public'
      when 'announcements' then 'published_at is not null and published_at <= now() and (expires_at is null or expires_at > now())'
      else 'true'
    end;
    execute format(
      'create policy %1$s_select on public.%1$I for select to anon, authenticated using ((public.race_is_public(race_id) and %2$s) or public.is_staff())',
      t, v_filter);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_edit_content())', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (public.can_edit_content()) with check (public.can_edit_content())', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_edit_content())', t);
  end loop;
end $$;

-- Participants hold personal data: organizers and admins only.
create policy participants_select on public.participants for select to authenticated
  using (public.can_edit_content());
create policy participants_insert on public.participants for insert to authenticated
  with check (public.can_edit_content());
create policy participants_update on public.participants for update to authenticated
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy participants_delete on public.participants for delete to authenticated
  using (public.can_edit_content());

-- Registrations: any staff can read (timers need bib/distance/status);
-- organizers edit. Timers change status through set_participation_status().
create policy registrations_select on public.registrations for select to authenticated
  using (public.is_staff());
create policy registrations_insert on public.registrations for insert to authenticated
  with check (public.can_edit_content());
create policy registrations_update on public.registrations for update to authenticated
  using (public.can_edit_content()) with check (public.can_edit_content());
create policy registrations_delete on public.registrations for delete to authenticated
  using (public.can_edit_content());

-- Timing events: staff read; all writes go through the timing functions.
create policy timing_events_select on public.timing_events for select to authenticated
  using (public.is_staff());

-- Results: public once provisional/official results are published.
create policy race_results_select on public.race_results for select to anon, authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.races r
      where r.id = race_results.race_id and r.is_published and r.results_publication <> 'hidden'
    )
  );

-- Audit log: organizers and admins read; nobody writes directly.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.can_edit_content());

-- Defence in depth: remove write privileges where only functions may write.
revoke insert, update, delete, truncate on public.timing_events, public.race_results, public.audit_logs from anon, authenticated;
revoke update on public.user_roles from anon, authenticated;
revoke all on public.participants, public.registrations, public.user_roles, public.profiles, public.audit_logs, public.timing_events from anon;

-- ---------------------------------------------------------------------------
-- Public views: explicit column allow-lists, owner rights, filtered to
-- published races and runners who agreed to be listed.
-- ---------------------------------------------------------------------------
create view public.public_entrants as
select
  reg.id as registration_id,
  reg.race_id,
  reg.bib,
  p.first_name,
  p.last_name,
  d.id as distance_id,
  d.slug as distance_slug,
  d.name as distance_name,
  c.id as category_id,
  c.code as category_code,
  c.name as category_name,
  reg.status
from public.registrations reg
join public.participants p on p.id = reg.participant_id
join public.race_distances d on d.id = reg.distance_id
join public.races r on r.id = reg.race_id
left join public.race_categories c on c.id = reg.category_id
where r.is_published and reg.public_listing and d.is_published;

create view public.public_results as
select
  rr.registration_id,
  rr.race_id,
  r.results_publication,
  reg.bib,
  p.first_name,
  p.last_name,
  rr.gender,
  d.id as distance_id,
  d.slug as distance_slug,
  d.name as distance_name,
  c.id as category_id,
  c.code as category_code,
  c.name as category_name,
  rr.status,
  rr.laps_completed,
  rr.finish_at,
  rr.gun_elapsed_ms,
  rr.net_elapsed_ms,
  rr.ranking_elapsed_s,
  rr.overall_rank,
  rr.category_rank,
  rr.gender_rank,
  rr.splits,
  rr.computed_at
from public.race_results rr
join public.registrations reg on reg.id = rr.registration_id
join public.participants p on p.id = reg.participant_id
join public.race_distances d on d.id = rr.distance_id
join public.races r on r.id = rr.race_id
left join public.race_categories c on c.id = rr.category_id
where r.is_published and r.results_publication <> 'hidden' and reg.public_listing and d.is_published;

-- Staff roster for the timing dashboard: names and bibs only, no contact data.
create view public.staff_roster as
select
  reg.id as registration_id,
  reg.race_id,
  reg.bib,
  p.first_name,
  p.last_name,
  p.gender,
  reg.distance_id,
  d.name as distance_name,
  reg.category_id,
  c.name as category_name,
  reg.status,
  reg.status_reason
from public.registrations reg
join public.participants p on p.id = reg.participant_id
join public.race_distances d on d.id = reg.distance_id
left join public.race_categories c on c.id = reg.category_id
where public.is_staff();

revoke all on public.public_entrants, public.public_results, public.staff_roster from anon, authenticated;
grant select on public.public_entrants, public.public_results to anon, authenticated;
grant select on public.staff_roster to authenticated;
