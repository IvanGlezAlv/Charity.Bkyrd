import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PublicResult } from "@/lib/types";

/** Published results for a race, read through the public_results view (respects publication status). */
export async function getPublicResults(raceId: string): Promise<{ rows: PublicResult[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_results")
    .select("*")
    .eq("race_id", raceId)
    .order("distance_id")
    .order("overall_rank", { ascending: true, nullsFirst: false })
    .order("laps_completed", { ascending: false })
    .order("bib");
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PublicResult[], error: null };
}
