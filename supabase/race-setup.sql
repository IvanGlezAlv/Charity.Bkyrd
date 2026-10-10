-- =============================================================================
-- Race facts for La Charity Bckyrd Ultra Vol. II. Safe to run once on the
-- production database (SQL editor) to create the race; it inserts no runners.
-- Facts come from the organizers. Coordinates, elevation, aid stations and the
-- manual are left empty for the organizers to fill in from the admin; upload
-- the GPX in Carrera y distancias.
-- =============================================================================

do $$
declare
  v_race uuid;
  v_dist uuid;
  v_venue uuid;
begin
  insert into public.races (slug, name, tagline, format, timezone, event_date, is_published, registration_note,
                            venue_name, social_links, ranking_basis)
  values ('charity-bkyrd-vol-ii', 'La Charity Bckyrd Ultra Vol. II', 'Last one standing',
          'backyard', 'America/Hermosillo', date '2026-11-28', true,
          'Inscripciones cerradas: cupo lleno.',
          'Las Riberas',
          '[{"label": "Instagram", "url": "https://www.instagram.com/charitybkyrd/"}]'::jsonb, 'gun')
  returning id into v_race;

  insert into public.locations (race_id, kind, name, sort_order)
  values (v_race, 'venue', 'Las Riberas', 0)
  returning id into v_venue;

  insert into public.race_distances (race_id, slug, name, distance_km, start_time, loop_interval_minutes,
                                     start_location_id, finish_location_id, description, sort_order, is_published)
  values (v_race, 'backyard', 'Backyard', 6.7, timestamptz '2026-11-28 16:00 America/Hermosillo', 60,
          v_venue, v_venue,
          'Una vuelta de 6.7 km cada hora. Gana quien quede al final.', 0, true)
  returning id into v_dist;

  insert into public.schedule_items (race_id, distance_id, location_id, starts_at, title)
  values (v_race, v_dist, v_venue, timestamptz '2026-11-28 16:00 America/Hermosillo', 'Primera salida');

  insert into public.content_sections (race_id, page, slug, title, body, sort_order) values
  (v_race, 'home', 'como-funciona', 'Cómo funciona',
   E'Cada hora en punto sale una vuelta de **6.7 km**. Quien no termina su vuelta antes de la siguiente salida queda fuera.\n\nLa carrera sigue hasta que solo queda una persona: *last one standing*.', 0),
  (v_race, 'info', 'formato', 'Formato backyard',
   E'- Primera salida: sábado 28 de noviembre de 2026, 4:00 PM.\n- Una vuelta de 6.7 km cada hora.\n- Termina tu vuelta antes de la siguiente salida para seguir en carrera.', 0);

  insert into public.podcast_episodes (race_id, episode_number, title, cover_path, sort_order) values
  (v_race, 4, 'El Territorio', '/brand/ep04-el-territorio.webp', 0),
  (v_race, 5, 'La Resistencia', '/brand/ep05-la-resistencia.webp', 1),
  (v_race, 6, 'El Combustible', '/brand/ep06-el-combustible.webp', 2),
  (v_race, 7, 'El Estilo', '/brand/ep07-el-estilo.webp', 3);

end $$;
