-- =============================================================================
-- Development seed, loaded by `supabase db reset` after race-setup.sql on a
-- LOCAL database only. These runners are fake test data; never run this file
-- in production. The real runner list is imported from the admin.
-- =============================================================================

do $$
declare
  v_race uuid := (select id from public.races where slug = 'charity-bkyrd-vol-ii');
  v_dist uuid := (select id from public.race_distances where race_id = (select id from public.races where slug = 'charity-bkyrd-vol-ii') and slug = 'backyard');
  i int;
  v_p uuid;
  v_first text[] := array['Ana','Bruno','Carla','Diego','Elena','Fer','Gabi','Hugo','Irene','Joel','Karla','Luis'];
begin
  -- Fake runners for local testing only.
  for i in 1..12 loop
    insert into public.participants (race_id, first_name, last_name, email, age, shirt_size)
    values (v_race, v_first[i], 'Prueba', format('prueba%s@example.com', i), 25 + i, (array['S','M','L'])[1 + i % 3])
    returning id into v_p;
    insert into public.registrations (race_id, participant_id, distance_id, bib)
    values (v_race, v_p, v_dist, lpad(i::text, 3, '0'));
  end loop;
end $$;
