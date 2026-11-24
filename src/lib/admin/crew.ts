import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface CrewGuest {
  name: string;
  position: number;
  /** The same name already appears in an earlier submission. */
  repeated: boolean;
}

export interface CrewSubmission {
  id: string;
  /** Set when bib + name matched a registered runner. */
  registration_id: string | null;
  /** Submitted as a runner (even if bib + name didn't match). */
  is_runner: boolean;
  /** Runner submitted, but bib + name didn't match the registered list. */
  bib_mismatch: boolean;
  /** Linked runner was taken off the race (bib freed, hidden from the list). */
  former_runner: boolean;
  /** Bib the runner typed. */
  bib: string | null;
  /** Registered bib and name when matched. */
  registered: { bib: string | null; name: string } | null;
  /** Registered runner name, or the name the non-runner typed. */
  submitter: string;
  with_runner: string | null;
  cars: number | null;
  plates: string | null;
  submitted_at: string;
  guests: CrewGuest[];
}

/** Lowercase, accents and extra spaces removed, to spot names sent twice. */
export function guestKey(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Every guest-list submission, oldest first. Organizers only (RLS). */
export async function loadCrewSubmissions(supabase: Client, raceId: string): Promise<CrewSubmission[]> {
  const { data, error } = await supabase
    .from("crew_submissions")
    .select("id, registration_id, is_runner, typed_bib, submitter_name, with_runner, cars, plates, submitted_at, registrations(bib, public_listing, participants(first_name, last_name)), crew_submission_guests(position, full_name)")
    .eq("race_id", raceId)
    .order("submitted_at");
  if (error) throw error;
  type Row = {
    id: string; registration_id: string | null; is_runner: boolean; typed_bib: string | null; submitter_name: string; with_runner: string | null; cars: number | null; plates: string | null; submitted_at: string;
    registrations: { bib: string | null; public_listing: boolean; participants: { first_name: string; last_name: string } } | null;
    crew_submission_guests: { position: number; full_name: string }[];
  };
  const seen = new Set<string>();
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    registration_id: r.registration_id,
    is_runner: r.is_runner,
    bib_mismatch: r.is_runner && !r.registration_id,
    former_runner: Boolean(r.registrations && (!r.registrations.bib || !r.registrations.public_listing)),
    bib: r.typed_bib,
    registered: r.registrations
      ? { bib: r.registrations.bib, name: `${r.registrations.participants.first_name} ${r.registrations.participants.last_name}`.trim() }
      : null,
    submitter: r.submitter_name,
    with_runner: r.with_runner,
    cars: r.cars,
    plates: r.plates,
    submitted_at: r.submitted_at,
    guests: [...r.crew_submission_guests].sort((a, b) => a.position - b.position).map((g) => {
      const key = guestKey(g.full_name);
      const repeated = seen.has(key);
      seen.add(key);
      return { name: g.full_name, position: g.position, repeated };
    }),
  }));
}

export const CREW_EXPORT_HEADER = ["Invitado", "Repetido", "Tipo", "Dorsal escrito", "Envía", "Dorsal coincide", "Corredor en la lista", "Acompaña a", "Núm. en la lista", "Autos de la lista", "Placas", "Enviado", "Envío"];
