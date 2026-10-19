import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { PROFILE_FIELDS, type RunnerProfile } from "@/lib/runner-profile";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface RunnerProfileRow extends Partial<Record<keyof RunnerProfile, string | null>> {
  bib: string | null;
  runner: string;
  updated_at: string;
}

/** Every submitted profile, sorted by bib. Organizers only (RLS). */
export async function loadRunnerProfiles(supabase: Client, raceId: string): Promise<RunnerProfileRow[]> {
  const { data, error } = await supabase
    .from("runner_profiles")
    .select(`${PROFILE_FIELDS.map((f) => f.name).join(", ")}, updated_at, registrations(bib, participants(first_name, last_name))`)
    .eq("race_id", raceId);
  if (error) throw error;
  type Row = Record<string, string | null> & { updated_at: string; registrations: { bib: string | null; participants: { first_name: string; last_name: string } } };
  return ((data ?? []) as unknown as Row[])
    .map(({ registrations: reg, ...rest }) => ({
      ...rest,
      bib: reg.bib,
      runner: `${reg.participants.first_name} ${reg.participants.last_name}`.trim(),
    }))
    .sort((a, b) => (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true }));
}
