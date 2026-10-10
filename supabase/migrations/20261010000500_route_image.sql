-- Organizer-supplied route graphic (for example the Instagram route card),
-- shown on the course page next to the map. A path starting with "/" is a
-- file shipped with the site; anything else is a path in the race-assets bucket.
alter table public.race_distances add column route_image_path text;
