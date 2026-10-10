import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import type {
  Announcement, Category, Checkpoint, Contact, ContentPage, ContentSection, Distance, DocumentRow, Faq, Location,
  PodcastEpisode, Race, ScheduleItem, Sponsor,
} from "@/lib/types";

/**
 * The race this deployment serves: NEXT_PUBLIC_RACE_SLUG if set, otherwise the
 * most recent race the visitor can see. Returns null when Supabase is not
 * configured or nothing is published yet.
 */
export const getActiveRace = cache(async (): Promise<Race | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  let query = supabase.from("races").select("*");
  query = env.raceSlug ? query.eq("slug", env.raceSlug) : query.order("event_date", { ascending: false, nullsFirst: false });
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    console.error("getActiveRace", error.message);
    return null;
  }
  return data as Race | null;
});

async function list<T>(table: string, raceId: string, order: [string, boolean][] = [["sort_order", true]]): Promise<T[]> {
  const supabase = await createClient();
  let q = supabase.from(table).select("*").eq("race_id", raceId);
  for (const [col, asc] of order) q = q.order(col, { ascending: asc });
  const { data, error } = await q;
  if (error) {
    console.error(`list ${table}`, error.message);
    return [];
  }
  return (data ?? []) as T[];
}

export const getDistances = cache((raceId: string) => list<Distance>("race_distances", raceId));
export const getCategories = cache((raceId: string) => list<Category>("race_categories", raceId));
export const getLocations = cache((raceId: string) => list<Location>("locations", raceId));
export const getCheckpoints = cache((raceId: string) =>
  list<Checkpoint>("course_checkpoints", raceId, [["sort_order", true], ["km_mark", true]]),
);
export const getSchedule = cache((raceId: string) => list<ScheduleItem>("schedule_items", raceId, [["starts_at", true]]));
export const getFaqs = cache((raceId: string) => list<Faq>("faqs", raceId));
export const getContacts = cache((raceId: string) => list<Contact>("contacts", raceId));
export const getSponsors = cache((raceId: string) => list<Sponsor>("sponsors", raceId));
export const getPodcast = cache((raceId: string) =>
  list<PodcastEpisode>("podcast_episodes", raceId, [["sort_order", true], ["episode_number", false]]),
);
export const getDocuments = cache((raceId: string) => list<DocumentRow>("documents", raceId, [["created_at", false]]));
export const getAnnouncements = cache((raceId: string) =>
  list<Announcement>("announcements", raceId, [["is_pinned", false], ["published_at", false]]),
);
export const getAllSections = cache((raceId: string) =>
  list<ContentSection>("content_sections", raceId, [["page", true], ["sort_order", true]]),
);

export async function getSections(raceId: string, page: ContentPage): Promise<ContentSection[]> {
  return (await getAllSections(raceId)).filter((s) => s.page === page);
}

/** Announcements currently live (RLS already hides drafts from the public; this also hides them from staff previews). */
export function liveAnnouncements(items: Announcement[], now = Date.now()): Announcement[] {
  return items.filter(
    (a) => a.published_at && new Date(a.published_at).getTime() <= now && (!a.expires_at || new Date(a.expires_at).getTime() > now),
  );
}
