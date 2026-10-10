-- =============================================================================
-- Timing, results calculation, publication, imports.
--
-- RANKING POLICY (also documented in docs/TIMING.md)
--   Precision: elapsed times are stored in milliseconds; rankings and public
--   display use whole seconds, truncated (12:34.999 ranks as 12:34).
--
--   Backyard format
--     * Yard n starts at start_time + (n-1) * loop_interval_minutes.
--     * A lap counts when its finish is recorded at or after the yard's start
--       and strictly before the next yard starts (whole-second precision).
--     * laps_completed = number of consecutive valid laps from yard 1.
--     * Ranked: every runner not DNS/DSQ with at least one completed lap.
--       Order: laps_completed desc, then runners marked "finished" (the last
--       one standing) first. Runners with equal laps share the same position
--       (standard competition ranking: 1, 2, 2, 4).
--
--   Fixed-distance format
--     * gun elapsed = finish - distance start_time.
--     * net elapsed = finish - runner's own start event (falls back to gun).
--     * Ranked: status "finished" with a valid finish after the start.
--       Order: elapsed seconds (gun or net per races.ranking_basis), ties share
--       the same position.
--
--   Nothing is ranked or timed without the required data. Missing or
--   suspicious data is reported in race_results.flags for staff review; a
--   missing checkpoint or lap record never changes a runner's status.
-- =============================================================================

create or replace function public.ms_between(a timestamptz, b timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when a is null or b is null then null
    else floor(extract(epoch from (a - b)) * 1000)::bigint end
$$;

-- ---------------------------------------------------------------------------
-- Results calculation
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_results(p_race_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basis text;
begin
  -- Serialize recalculations per race so concurrent submissions cannot interleave.
  perform pg_advisory_xact_lock(hashtextextended('race_results:' || p_race_id::text, 0));

  select r.ranking_basis into v_basis from public.races r where r.id = p_race_id;
  if not found then
    return;
  end if;

  with ev as (
    select e.* from public.timing_events e
    where e.race_id = p_race_id and e.voided_at is null
  ),
  base as (
    select reg.id as registration_id, reg.race_id, reg.distance_id, reg.category_id, reg.status,
           p.gender, d.start_time, d.cutoff_minutes,
           coalesce(d.loop_interval_minutes, 60) as interval_min,
           r.format
    from public.registrations reg
    join public.participants p on p.id = reg.participant_id
    join public.race_distances d on d.id = reg.distance_id
    join public.races r on r.id = reg.race_id
    where reg.race_id = p_race_id
  ),
  -- Backyard laps ----------------------------------------------------------
  laps as (
    select e.registration_id, e.lap_number, e.recorded_at,
           b.start_time + make_interval(mins => b.interval_min * (e.lap_number - 1)) as yard_start,
           b.start_time + make_interval(mins => b.interval_min * e.lap_number) as yard_end
    from ev e join base b on b.registration_id = e.registration_id
    where e.kind = 'lap'
  ),
  laps_v as (
    select l.*,
           (l.yard_start is not null and l.recorded_at >= l.yard_start
             and date_trunc('second', l.recorded_at) < l.yard_end) as valid
    from laps l
  ),
  lap_summary as (
    select b.registration_id,
      coalesce((
        select min(c.n) from (
          select 1 as n
          union all
          select lv.lap_number + 1 from laps_v lv where lv.registration_id = b.registration_id and lv.valid
        ) c
        where not exists (
          select 1 from laps_v x where x.registration_id = b.registration_id and x.valid and x.lap_number = c.n
        )
      ) - 1, 0) as laps_completed,
      (select max(l2.lap_number) from laps l2 where l2.registration_id = b.registration_id) as max_lap
    from base b
  ),
  lap_flags as (
    select lv.registration_id,
           array_agg(
             case when lv.yard_start is null then 'no_start_time'
                  when lv.recorded_at < lv.yard_start then 'early_lap:' || lv.lap_number
                  else 'late_lap:' || lv.lap_number end
             order by lv.lap_number) as flags
    from laps_v lv where not lv.valid
    group by lv.registration_id
  ),
  missing_laps as (
    select ls.registration_id,
           array_agg('missing_lap:' || g.n order by g.n) as flags
    from lap_summary ls
    cross join lateral generate_series(1, coalesce(ls.max_lap, 0) - 1) as g(n)
    where not exists (select 1 from laps l where l.registration_id = ls.registration_id and l.lap_number = g.n)
    group by ls.registration_id
  ),
  -- Starts / finishes ------------------------------------------------------
  own_start as (
    select e.registration_id, e.recorded_at from ev e where e.kind = 'start'
  ),
  fin as (
    select e.registration_id, e.recorded_at from ev e where e.kind = 'finish'
  ),
  -- Checkpoint splits and lap splits ------------------------------------
  cp_events as (
    select e.registration_id, e.lap_number, e.recorded_at, cp.id as checkpoint_id, cp.name, cp.sort_order,
           b.start_time
    from ev e
    join base b on b.registration_id = e.registration_id
    join public.course_checkpoints cp on cp.id = e.checkpoint_id
    where e.kind = 'checkpoint'
  ),
  splits as (
    select s.registration_id, jsonb_agg(s.obj order by s.lap_sort, s.sort_order, s.recorded_at) as splits
    from (
      select c.registration_id, coalesce(c.lap_number, 0) as lap_sort, c.sort_order, c.recorded_at,
             jsonb_build_object('type', 'checkpoint', 'checkpoint_id', c.checkpoint_id, 'name', c.name,
               'lap', c.lap_number, 'at', c.recorded_at,
               'elapsed_ms', public.ms_between(c.recorded_at, c.start_time)) as obj
      from cp_events c
      union all
      select lv.registration_id, lv.lap_number, 1000000, lv.recorded_at,
             jsonb_build_object('type', 'lap', 'lap', lv.lap_number, 'at', lv.recorded_at,
               'lap_ms', public.ms_between(lv.recorded_at, lv.yard_start),
               'elapsed_ms', public.ms_between(lv.recorded_at, b.start_time),
               'valid', lv.valid)
      from laps_v lv join base b on b.registration_id = lv.registration_id
    ) s
    group by s.registration_id
  ),
  cp_flags as (
    select b.registration_id,
           array_agg('missing_checkpoint:' || cp.name order by cp.sort_order) as flags
    from base b
    join fin f on f.registration_id = b.registration_id
    join public.course_checkpoints cp on cp.distance_id = b.distance_id and cp.is_timed
    where b.format = 'fixed_distance'
      and not exists (select 1 from cp_events c where c.registration_id = b.registration_id and c.checkpoint_id = cp.id)
    group by b.registration_id
  ),
  cp_order_flags as (
    select distinct c.registration_id, 'checkpoint_order'::text as flag
    from cp_events c
    join cp_events c2 on c2.registration_id = c.registration_id
      and coalesce(c2.lap_number, 0) = coalesce(c.lap_number, 0)
      and c2.sort_order > c.sort_order and c2.recorded_at < c.recorded_at
  ),
  -- Per-runner computation -----------------------------------------------
  computed as (
    select
      b.registration_id, b.race_id, b.distance_id, b.category_id, b.gender, b.status, b.format,
      case when b.format = 'backyard' then ls.laps_completed else 0 end as laps_completed,
      case when b.format = 'backyard' then b.start_time else coalesce(os.recorded_at, b.start_time) end as start_at,
      case when b.format = 'backyard'
           then (select lv.recorded_at from laps_v lv where lv.registration_id = b.registration_id
                   and lv.valid and lv.lap_number = ls.laps_completed)
           else f.recorded_at end as finish_at,
      b.start_time, os.recorded_at as own_start_at, f.recorded_at as fin_at, b.cutoff_minutes,
      coalesce(sp.splits, '[]'::jsonb) as splits,
      coalesce(lf.flags, '{}') || coalesce(ml.flags, '{}') || coalesce(cf.flags, '{}')
        || coalesce((select array_agg(o.flag) from cp_order_flags o where o.registration_id = b.registration_id), '{}')
        as base_flags
    from base b
    join lap_summary ls on ls.registration_id = b.registration_id
    left join own_start os on os.registration_id = b.registration_id
    left join fin f on f.registration_id = b.registration_id
    left join splits sp on sp.registration_id = b.registration_id
    left join lap_flags lf on lf.registration_id = b.registration_id
    left join missing_laps ml on ml.registration_id = b.registration_id
    left join cp_flags cf on cf.registration_id = b.registration_id
  ),
  timed as (
    select c.*,
      public.ms_between(c.finish_at, c.start_time) as gun_ms,
      case when c.format = 'fixed_distance' then public.ms_between(c.finish_at, coalesce(c.own_start_at, c.start_time)) end as net_ms
    from computed c
  ),
  judged as (
    select t.*,
      case
        when t.format = 'backyard' then
          t.status not in ('dns', 'dsq') and t.laps_completed > 0 and t.start_time is not null
        else
          t.status = 'finished' and t.fin_at is not null and t.start_time is not null
          and t.gun_ms > 0 and coalesce(t.net_ms, 1) > 0
      end as is_ranked,
      t.base_flags || array_remove(array[
        case when t.start_time is null and (t.fin_at is not null or t.laps_completed > 0 or jsonb_array_length(t.splits) > 0)
             then 'no_start_time' end,
        case when t.format = 'fixed_distance' and t.fin_at is not null and t.start_time is not null
                  and (t.gun_ms <= 0 or coalesce(t.net_ms, 1) <= 0) then 'finish_before_start' end,
        case when t.format = 'fixed_distance' and t.status = 'finished' and t.fin_at is null then 'finished_without_time' end,
        case when t.format = 'fixed_distance' and t.fin_at is not null and t.status in ('dnf', 'dns', 'dsq')
             then 'time_recorded_for_' || t.status::text end,
        case when t.format = 'fixed_distance' and t.cutoff_minutes is not null and t.gun_ms > t.cutoff_minutes::bigint * 60000
             then 'over_cutoff' end,
        case when t.format = 'backyard' and t.status = 'dns' and t.laps_completed > 0 then 'laps_recorded_for_dns' end
      ]::text[], null) as all_flags
    from timed t
  ),
  ranked as (
    select j.*,
      case when j.format = 'fixed_distance' and j.is_ranked
           then floor((case when v_basis = 'net' then coalesce(j.net_ms, j.gun_ms) else j.gun_ms end) / 1000.0)::bigint
      end as rank_s,
      case when j.format = 'backyard' then -j.laps_completed::bigint end as by_key1,
      case when j.format = 'backyard' then (case when j.status = 'finished' then 0 else 1 end) else 0 end as by_key2
    from judged j
  ),
  final as (
    select r.*,
      case when r.is_ranked then rank() over (
        partition by r.distance_id, r.is_ranked order by coalesce(r.by_key1, r.rank_s), r.by_key2) end as overall_rank,
      case when r.is_ranked and r.category_id is not null then rank() over (
        partition by r.distance_id, r.is_ranked, r.category_id order by coalesce(r.by_key1, r.rank_s), r.by_key2) end as category_rank,
      case when r.is_ranked and r.gender is not null then rank() over (
        partition by r.distance_id, r.is_ranked, r.gender order by coalesce(r.by_key1, r.rank_s), r.by_key2) end as gender_rank
    from ranked r
  )
  insert into public.race_results as rr (
    registration_id, race_id, distance_id, category_id, gender, status, laps_completed, start_at, finish_at,
    gun_elapsed_ms, net_elapsed_ms, ranking_elapsed_s, overall_rank, category_rank, gender_rank, splits, flags, computed_at)
  select f.registration_id, f.race_id, f.distance_id, f.category_id, f.gender, f.status, f.laps_completed,
         f.start_at,
         case when f.format = 'backyard' or f.is_ranked or f.fin_at is not null then f.finish_at end,
         case when f.gun_ms > 0 then f.gun_ms end,
         case when f.net_ms > 0 then f.net_ms end,
         f.rank_s, f.overall_rank, f.category_rank, f.gender_rank, f.splits, f.all_flags, now()
  from final f
  on conflict (registration_id) do update set
    race_id = excluded.race_id,
    distance_id = excluded.distance_id,
    category_id = excluded.category_id,
    gender = excluded.gender,
    status = excluded.status,
    laps_completed = excluded.laps_completed,
    start_at = excluded.start_at,
    finish_at = excluded.finish_at,
    gun_elapsed_ms = excluded.gun_elapsed_ms,
    net_elapsed_ms = excluded.net_elapsed_ms,
    ranking_elapsed_s = excluded.ranking_elapsed_s,
    overall_rank = excluded.overall_rank,
    category_rank = excluded.category_rank,
    gender_rank = excluded.gender_rank,
    splits = excluded.splits,
    flags = excluded.flags,
    computed_at = excluded.computed_at
  where (rr.distance_id, rr.category_id, rr.gender, rr.status, rr.laps_completed, rr.start_at, rr.finish_at,
         rr.gun_elapsed_ms, rr.net_elapsed_ms, rr.ranking_elapsed_s, rr.overall_rank, rr.category_rank,
         rr.gender_rank, rr.splits, rr.flags)
    is distinct from
        (excluded.distance_id, excluded.category_id, excluded.gender, excluded.status, excluded.laps_completed,
         excluded.start_at, excluded.finish_at, excluded.gun_elapsed_ms, excluded.net_elapsed_ms,
         excluded.ranking_elapsed_s, excluded.overall_rank, excluded.category_rank, excluded.gender_rank,
         excluded.splits, excluded.flags);
end;
$$;

-- Statement-level triggers keep race_results consistent with their sources.
create or replace function public.trg_recalculate_from_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_ids := v_ids || array(select distinct n.race_id from new_rows n);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_ids := v_ids || array(select distinct o.race_id from old_rows o);
  end if;
  for v_id in select distinct x from unnest(v_ids) as x loop
    perform public.recalculate_results(v_id);
  end loop;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['timing_events', 'registrations', 'race_distances', 'participants', 'course_checkpoints'] loop
    execute format('create trigger recalc_after_insert after insert on public.%I referencing new table as new_rows for each statement execute function public.trg_recalculate_from_rows()', t);
    execute format('create trigger recalc_after_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.trg_recalculate_from_rows()', t);
    execute format('create trigger recalc_after_delete after delete on public.%I referencing old table as old_rows for each statement execute function public.trg_recalculate_from_rows()', t);
  end loop;
end $$;

create or replace function public.trg_recalculate_race()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ranking_basis is distinct from old.ranking_basis or new.format is distinct from old.format then
    perform public.recalculate_results(new.id);
  end if;
  return null;
end;
$$;

create trigger recalc_after_race_update
  after update on public.races
  for each row execute function public.trg_recalculate_race();

-- ---------------------------------------------------------------------------
-- Timing operations (the only write path for timing_events)
-- ---------------------------------------------------------------------------
create or replace function public.assert_can_time()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_time() then
    raise exception 'Not authorized to record timing' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_results_open(p_race_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.races r where r.id = p_race_id and r.results_publication = 'official') then
    raise exception 'Results are official. An administrator must reopen them before timing changes.'
      using errcode = 'P0001', hint = 'results_official';
  end if;
end;
$$;

create or replace function public.record_timing_event(
  p_race_id uuid,
  p_registration_id uuid,
  p_kind public.timing_kind,
  p_lap_number int default null,
  p_checkpoint_id uuid default null,
  p_recorded_at timestamptz default null,
  p_client_event_id uuid default null,
  p_overwrite boolean default false,
  p_reason text default null,
  p_source public.timing_source default 'manual',
  p_device_id text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_at timestamptz := coalesce(p_recorded_at, v_now);
  v_reg public.registrations%rowtype;
  v_race public.races%rowtype;
  v_dist public.race_distances%rowtype;
  v_lap int := p_lap_number;
  v_yard_now int;
  v_existing public.timing_events%rowtype;
  v_new public.timing_events%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_can_time();

  if p_client_event_id is not null then
    select * into v_existing from public.timing_events where client_event_id = p_client_event_id;
    if found then
      return jsonb_build_object('result', 'duplicate', 'event', to_jsonb(v_existing));
    end if;
  end if;

  select * into v_race from public.races where id = p_race_id;
  if not found then
    raise exception 'Race not found' using errcode = 'P0002';
  end if;
  perform public.assert_results_open(p_race_id);

  -- Row lock serializes concurrent submissions for the same runner.
  select * into v_reg from public.registrations where id = p_registration_id and race_id = p_race_id for update;
  if not found then
    raise exception 'Runner not found in this race' using errcode = 'P0002';
  end if;
  if v_reg.status in ('dns', 'dsq') then
    raise exception 'Runner is marked %. Change the status before recording times.', upper(v_reg.status::text)
      using errcode = 'P0001', hint = 'status_blocks_timing';
  end if;

  select * into v_dist from public.race_distances where id = v_reg.distance_id;

  if v_at > v_now + interval '1 minute' then
    raise exception 'Timestamp is in the future' using errcode = '22023';
  end if;

  if v_race.format = 'backyard' and p_kind in ('start', 'finish') then
    raise exception 'Backyard races record laps, not % events', p_kind using errcode = '22023';
  end if;
  if v_race.format = 'fixed_distance' and p_kind = 'lap' then
    raise exception 'Fixed-distance races do not record laps' using errcode = '22023';
  end if;
  if p_kind = 'checkpoint' then
    if p_checkpoint_id is null or not exists (
      select 1 from public.course_checkpoints cp where cp.id = p_checkpoint_id and cp.distance_id = v_reg.distance_id) then
      raise exception 'Checkpoint does not belong to this runner''s course' using errcode = '22023';
    end if;
    if v_race.format = 'fixed_distance' then
      v_lap := null;
    end if;
  elsif p_checkpoint_id is not null then
    raise exception 'Checkpoint only applies to checkpoint events' using errcode = '22023';
  end if;
  if p_kind in ('start', 'finish') then
    v_lap := null;
  end if;

  if p_kind = 'lap' then
    if v_dist.start_time is null then
      raise exception 'Set the start time of % before recording laps', v_dist.name using errcode = 'P0001';
    end if;
    if v_at < v_dist.start_time then
      raise exception 'The race has not started yet' using errcode = 'P0001', hint = 'before_start';
    end if;
    v_yard_now := floor(extract(epoch from (v_at - v_dist.start_time)) / (coalesce(v_dist.loop_interval_minutes, 60) * 60))::int + 1;
    if v_lap is null then
      select coalesce(max(e.lap_number), 0) + 1 into v_lap
      from public.timing_events e
      where e.registration_id = p_registration_id and e.kind = 'lap' and e.voided_at is null;
      -- Double-tap guard: a lap cannot finish before its yard has started.
      if v_lap > v_yard_now then
        select * into v_existing from public.timing_events e
        where e.registration_id = p_registration_id and e.kind = 'lap' and e.voided_at is null and e.lap_number = v_lap - 1;
        return jsonb_build_object('result', 'conflict', 'reason', 'lap_already_recorded', 'lap_number', v_lap - 1,
                                  'existing', to_jsonb(v_existing));
      end if;
    end if;
  end if;

  select * into v_existing from public.timing_events e
  where e.registration_id = p_registration_id
    and e.kind = p_kind
    and e.voided_at is null
    and coalesce(e.lap_number, 0) = coalesce(v_lap, 0)
    and coalesce(e.checkpoint_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_checkpoint_id, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  if found then
    if not p_overwrite then
      return jsonb_build_object('result', 'conflict', 'reason', 'exists', 'existing', to_jsonb(v_existing));
    end if;
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'A reason is required to overwrite a recorded time' using errcode = '22023';
    end if;
    perform set_config('app.audit_reason', v_reason, true);
    update public.timing_events
       set voided_at = v_now, voided_by = auth.uid(), void_reason = v_reason
     where id = v_existing.id;
  elsif v_reason is not null then
    perform set_config('app.audit_reason', v_reason, true);
  end if;

  insert into public.timing_events (race_id, registration_id, kind, lap_number, checkpoint_id, recorded_at,
                                    source, device_id, client_event_id, note, recorded_by)
  values (p_race_id, p_registration_id, p_kind, case when p_kind in ('lap', 'checkpoint') then v_lap end,
          p_checkpoint_id, v_at, p_source, p_device_id, p_client_event_id, p_note, auth.uid())
  returning * into v_new;

  if v_existing.id is not null and p_overwrite then
    update public.timing_events set replaced_by = v_new.id where id = v_existing.id;
  end if;

  if v_reg.status = 'registered' or (p_kind = 'finish' and v_reg.status = 'started') then
    update public.registrations
       set status = case when p_kind = 'finish' then 'finished'::public.participation_status else 'started' end,
           status_changed_at = v_now,
           status_changed_by = auth.uid()
     where id = p_registration_id;
  end if;

  return jsonb_build_object(
    'result', 'recorded',
    'event', to_jsonb(v_new),
    'replaced', case when p_overwrite and v_existing.id is not null then to_jsonb(v_existing) end);
end;
$$;

create or replace function public.void_timing_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.timing_events%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_can_time();
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_ev from public.timing_events where id = p_event_id for update;
  if not found then
    raise exception 'Timing record not found' using errcode = 'P0002';
  end if;
  if v_ev.voided_at is not null then
    raise exception 'This record was already removed' using errcode = 'P0001';
  end if;
  perform public.assert_results_open(v_ev.race_id);
  perform set_config('app.audit_reason', v_reason, true);
  update public.timing_events
     set voided_at = clock_timestamp(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_event_id
  returning * into v_ev;
  return to_jsonb(v_ev);
end;
$$;

create or replace function public.correct_timing_event(p_event_id uuid, p_recorded_at timestamptz, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.timing_events%rowtype;
begin
  perform public.assert_can_time();
  select * into v_ev from public.timing_events where id = p_event_id and voided_at is null;
  if not found then
    raise exception 'Active timing record not found' using errcode = 'P0002';
  end if;
  if p_recorded_at is null then
    raise exception 'A corrected time is required' using errcode = '22023';
  end if;
  return public.record_timing_event(
    p_race_id => v_ev.race_id,
    p_registration_id => v_ev.registration_id,
    p_kind => v_ev.kind,
    p_lap_number => v_ev.lap_number,
    p_checkpoint_id => v_ev.checkpoint_id,
    p_recorded_at => p_recorded_at,
    p_overwrite => true,
    p_reason => p_reason,
    p_source => 'manual');
end;
$$;

create or replace function public.set_participation_status(
  p_registration_id uuid,
  p_status public.participation_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not (public.can_time() or public.can_edit_content()) then
    raise exception 'Not authorized to change runner status' using errcode = '42501';
  end if;
  select * into v_reg from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'Runner not found' using errcode = 'P0002';
  end if;
  perform public.assert_results_open(v_reg.race_id);
  if v_reg.status = p_status then
    return to_jsonb(v_reg);
  end if;
  if (p_status in ('dns', 'dnf', 'dsq') or v_reg.status in ('dns', 'dnf', 'dsq', 'finished'))
     and (v_reason is null or length(v_reason) < 3) then
    raise exception 'A reason is required for this status change' using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', coalesce(v_reason, ''), true);
  update public.registrations
     set status = p_status, status_reason = v_reason, status_changed_at = clock_timestamp(), status_changed_by = auth.uid()
   where id = p_registration_id
  returning * into v_reg;
  return to_jsonb(v_reg);
end;
$$;

-- Imports a batch of timing rows atomically: either every row is applied
-- (or skipped as a duplicate) or nothing is.
-- p_rows: [{ "registration_id", "kind", "recorded_at", "lap_number"?, "checkpoint_id"? }]
create or replace function public.import_timing_events(
  p_race_id uuid,
  p_rows jsonb,
  p_on_conflict text default 'skip',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_res jsonb;
  v_idx int := 0;
  v_recorded int := 0;
  v_skipped int := 0;
  v_replaced int := 0;
  v_conflicts jsonb := '[]'::jsonb;
begin
  perform public.assert_can_time();
  if p_on_conflict not in ('skip', 'overwrite') then
    raise exception 'Unknown conflict strategy %', p_on_conflict using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import at most 5000 rows at a time' using errcode = '22023';
  end if;

  -- Chronological order keeps automatically numbered laps sequential.
  for v_row in
    select r.value from jsonb_array_elements(p_rows) with ordinality as r(value, ord)
    order by (r.value ->> 'recorded_at')::timestamptz, r.ord
  loop
    v_idx := v_idx + 1;
    begin
      v_res := public.record_timing_event(
        p_race_id => p_race_id,
        p_registration_id => (v_row ->> 'registration_id')::uuid,
        p_kind => (v_row ->> 'kind')::public.timing_kind,
        p_lap_number => nullif(v_row ->> 'lap_number', '')::int,
        p_checkpoint_id => nullif(v_row ->> 'checkpoint_id', '')::uuid,
        p_recorded_at => (v_row ->> 'recorded_at')::timestamptz,
        p_overwrite => p_on_conflict = 'overwrite',
        p_reason => coalesce(p_reason, 'CSV import'),
        p_source => 'csv');
    exception when others then
      raise exception 'Row with bib % (%): %', coalesce(v_row ->> 'bib', '?'), v_row ->> 'recorded_at', sqlerrm
        using errcode = sqlstate;
    end;
    if v_res ->> 'result' = 'recorded' then
      v_recorded := v_recorded + 1;
      if v_res -> 'replaced' is not null and v_res -> 'replaced' <> 'null'::jsonb then
        v_replaced := v_replaced + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
      v_conflicts := v_conflicts || jsonb_build_object('bib', v_row ->> 'bib', 'recorded_at', v_row ->> 'recorded_at',
                                                       'reason', v_res ->> 'reason');
    end if;
  end loop;

  return jsonb_build_object('recorded', v_recorded, 'replaced', v_replaced, 'skipped', v_skipped, 'conflicts', v_conflicts);
end;
$$;

-- ---------------------------------------------------------------------------
-- Results publication
-- ---------------------------------------------------------------------------
create or replace function public.set_results_publication(
  p_race_id uuid,
  p_publication public.results_publication,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_race from public.races where id = p_race_id for update;
  if not found then
    raise exception 'Race not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Making results official, or reopening official results, is admin-only.
  if (p_publication = 'official' or v_race.results_publication = 'official') and not public.has_role('admin') then
    raise exception 'Only administrators can publish or reopen official results' using errcode = '42501';
  end if;
  if not public.can_edit_content() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_race.results_publication = 'official' and p_publication <> 'official'
     and (v_reason is null or length(v_reason) < 3) then
    raise exception 'A reason is required to reopen official results' using errcode = '22023';
  end if;

  perform public.recalculate_results(p_race_id);
  perform set_config('app.publication_change', 'on', true);
  perform set_config('app.audit_reason', coalesce(v_reason, ''), true);
  update public.races
     set results_publication = p_publication,
         results_published_at = case when p_publication = 'official' then now() else results_published_at end,
         results_published_by = case when p_publication = 'official' then auth.uid() else results_published_by end
   where id = p_race_id
  returning * into v_race;
  perform set_config('app.publication_change', 'off', true);

  return jsonb_build_object('results_publication', v_race.results_publication,
                            'results_published_at', v_race.results_published_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Race-day overview: counts straight from the database.
-- ---------------------------------------------------------------------------
create or replace function public.race_overview(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_agg(row_to_json(x) order by x.sort_order) into v_result
  from (
    select d.id as distance_id, d.name, d.sort_order, d.start_time, d.loop_interval_minutes,
      count(reg.id) as registered,
      count(reg.id) filter (where reg.status in ('started', 'finished', 'dnf')
                               or exists (select 1 from public.timing_events e where e.registration_id = reg.id and e.voided_at is null)) as starters,
      count(reg.id) filter (where reg.status = 'finished') as finished,
      count(reg.id) filter (where reg.status = 'started') as on_course,
      count(reg.id) filter (where reg.status = 'registered') as not_yet_started,
      count(reg.id) filter (where reg.status = 'dns') as dns,
      count(reg.id) filter (where reg.status = 'dnf') as dnf,
      count(reg.id) filter (where reg.status = 'dsq') as dsq,
      count(rr.registration_id) filter (where cardinality(rr.flags) > 0) as flagged,
      -- Backyard: runners still in the race whose lap for an already-finished yard has not been recorded.
      count(reg.id) filter (
        where d.start_time is not null and r.format = 'backyard' and reg.status = 'started'
          and now() >= d.start_time + make_interval(mins => coalesce(d.loop_interval_minutes, 60) * (coalesce(rr.laps_completed, 0) + 1))
      ) as awaiting_lap_record
    from public.race_distances d
    join public.races r on r.id = d.race_id
    left join public.registrations reg on reg.distance_id = d.id
    left join public.race_results rr on rr.registration_id = reg.id
    where d.race_id = p_race_id
    group by d.id, d.name, d.sort_order, d.start_time, d.loop_interval_minutes
  ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Participant import: applied atomically after the app has shown a preview.
-- p_strategy: 'create_only'      new runners are added, matches are skipped
--             'update_existing'  matches are updated with the non-empty fields
-- Matching order: external_ref, then bib, then first+last name+birth date.
-- ---------------------------------------------------------------------------
create or replace function public.import_participants(
  p_race_id uuid,
  p_rows jsonb,
  p_strategy text default 'create_only'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_participant_id uuid;
  v_reg_id uuid;
  v_distance_id uuid;
  v_category_id uuid;
  v_bib text;
begin
  if auth.uid() is null or not public.can_edit_content() then
    raise exception 'Not authorized to import participants' using errcode = '42501';
  end if;
  if p_strategy not in ('create_only', 'update_existing') then
    raise exception 'Unknown import strategy %', p_strategy using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to import' using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', 'Participant import (' || p_strategy || ')', true);

  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality as e(value, n) order by e.n loop
    v_idx := v_idx + 1;
    v_bib := nullif(trim(v_row ->> 'bib'), '');

    select d.id into v_distance_id from public.race_distances d
    where d.race_id = p_race_id and d.slug = v_row ->> 'distance_slug';
    if v_distance_id is null then
      raise exception 'Row %: unknown distance "%"', v_idx, v_row ->> 'distance_slug' using errcode = '22023';
    end if;

    v_category_id := null;
    if nullif(v_row ->> 'category_code', '') is not null then
      select c.id into v_category_id from public.race_categories c
      where c.race_id = p_race_id and c.code = v_row ->> 'category_code';
      if v_category_id is null then
        raise exception 'Row %: unknown category "%"', v_idx, v_row ->> 'category_code' using errcode = '22023';
      end if;
    end if;

    -- Find an existing match.
    v_participant_id := null;
    if nullif(v_row ->> 'external_ref', '') is not null then
      select p.id into v_participant_id from public.participants p
      where p.race_id = p_race_id and p.external_ref = v_row ->> 'external_ref';
    end if;
    if v_participant_id is null and v_bib is not null then
      select reg.participant_id into v_participant_id from public.registrations reg
      where reg.race_id = p_race_id and reg.bib = v_bib;
    end if;
    if v_participant_id is null and nullif(v_row ->> 'birth_date', '') is not null then
      select p.id into v_participant_id from public.participants p
      where p.race_id = p_race_id
        and lower(p.first_name) = lower(trim(v_row ->> 'first_name'))
        and lower(p.last_name) = lower(trim(coalesce(v_row ->> 'last_name', '')))
        and p.birth_date = (v_row ->> 'birth_date')::date
      limit 1;
    end if;

    if v_participant_id is not null then
      if p_strategy = 'create_only' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      update public.participants p set
        first_name = coalesce(nullif(trim(v_row ->> 'first_name'), ''), p.first_name),
        last_name = coalesce(nullif(trim(v_row ->> 'last_name'), ''), p.last_name),
        email = coalesce(nullif(trim(v_row ->> 'email'), ''), p.email),
        phone = coalesce(nullif(trim(v_row ->> 'phone'), ''), p.phone),
        birth_date = coalesce(nullif(v_row ->> 'birth_date', '')::date, p.birth_date),
        age = coalesce(nullif(v_row ->> 'age', '')::int, p.age),
        shirt_size = coalesce(nullif(trim(v_row ->> 'shirt_size'), ''), p.shirt_size),
        gender = coalesce(nullif(v_row ->> 'gender', ''), p.gender),
        nationality = coalesce(nullif(trim(v_row ->> 'nationality'), ''), p.nationality),
        city = coalesce(nullif(trim(v_row ->> 'city'), ''), p.city),
        club = coalesce(nullif(trim(v_row ->> 'club'), ''), p.club),
        emergency_contact_name = coalesce(nullif(trim(v_row ->> 'emergency_contact_name'), ''), p.emergency_contact_name),
        emergency_contact_phone = coalesce(nullif(trim(v_row ->> 'emergency_contact_phone'), ''), p.emergency_contact_phone),
        medical_notes = coalesce(nullif(trim(v_row ->> 'medical_notes'), ''), p.medical_notes),
        external_ref = coalesce(nullif(trim(v_row ->> 'external_ref'), ''), p.external_ref)
      where p.id = v_participant_id;

      update public.registrations reg set
        distance_id = v_distance_id,
        category_id = coalesce(v_category_id, reg.category_id),
        bib = coalesce(v_bib, reg.bib)
      where reg.race_id = p_race_id and reg.participant_id = v_participant_id
      returning reg.id into v_reg_id;

      if v_reg_id is null then
        insert into public.registrations (race_id, participant_id, distance_id, category_id, bib)
        values (p_race_id, v_participant_id, v_distance_id, v_category_id, v_bib);
      end if;
      v_updated := v_updated + 1;
    else
      insert into public.participants (race_id, first_name, last_name, email, phone, birth_date, age, shirt_size, gender, nationality,
        city, club, emergency_contact_name, emergency_contact_phone, medical_notes, external_ref)
      values (p_race_id, trim(v_row ->> 'first_name'), coalesce(trim(v_row ->> 'last_name'), ''),
        nullif(trim(v_row ->> 'email'), ''), nullif(trim(v_row ->> 'phone'), ''), nullif(v_row ->> 'birth_date', '')::date,
        nullif(v_row ->> 'age', '')::int, nullif(trim(v_row ->> 'shirt_size'), ''),
        nullif(v_row ->> 'gender', ''), nullif(trim(v_row ->> 'nationality'), ''), nullif(trim(v_row ->> 'city'), ''),
        nullif(trim(v_row ->> 'club'), ''), nullif(trim(v_row ->> 'emergency_contact_name'), ''),
        nullif(trim(v_row ->> 'emergency_contact_phone'), ''), nullif(trim(v_row ->> 'medical_notes'), ''),
        nullif(trim(v_row ->> 'external_ref'), ''))
      returning id into v_participant_id;
      insert into public.registrations (race_id, participant_id, distance_id, category_id, bib)
      values (p_race_id, v_participant_id, v_distance_id, v_category_id, v_bib);
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped);
exception
  when unique_violation then
    raise exception 'Row %: bib number or external reference already belongs to another runner (%)', v_idx, sqlerrm
      using errcode = '23505';
end;
$$;

-- Internal functions are not callable through the API.
revoke execute on function public.recalculate_results(uuid) from public, anon, authenticated;
revoke execute on function public.trg_recalculate_from_rows() from public, anon, authenticated;
revoke execute on function public.trg_recalculate_race() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Staff operations require a signed-in user (each checks roles internally).
do $$
declare f text;
begin
  foreach f in array array[
    'public.record_timing_event(uuid, uuid, public.timing_kind, int, uuid, timestamptz, uuid, boolean, text, public.timing_source, text, text)',
    'public.void_timing_event(uuid, text)',
    'public.correct_timing_event(uuid, timestamptz, text)',
    'public.set_participation_status(uuid, public.participation_status, text)',
    'public.import_timing_events(uuid, jsonb, text, text)',
    'public.set_results_publication(uuid, public.results_publication, text)',
    'public.race_overview(uuid)',
    'public.import_participants(uuid, jsonb, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
