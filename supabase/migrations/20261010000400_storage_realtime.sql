-- =============================================================================
-- Storage bucket for race assets, and Realtime publication for live results.
-- =============================================================================

-- Public-read bucket: hero images, logos, sponsor logos, GPX files, manual PDF.
-- Size and MIME type are enforced by Storage itself and again by the app.
-- SVG is deliberately not allowed (it can carry scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'race-assets',
  'race-assets',
  true,
  26214400, -- 25 MB
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only organizers and admins can write; files are organized as <race_id>/<kind>/<file>.
create policy race_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'race-assets' and public.can_edit_content());
create policy race_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'race-assets' and public.can_edit_content())
  with check (bucket_id = 'race-assets' and public.can_edit_content());
create policy race_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'race-assets' and public.can_edit_content());
create policy race_assets_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'race-assets');

-- Realtime: results for the public board (filtered by RLS), timing events
-- and registrations for the staff dashboard (RLS limits them to staff).
alter publication supabase_realtime add table public.race_results;
alter publication supabase_realtime add table public.timing_events;
alter publication supabase_realtime add table public.registrations;
