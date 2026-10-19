import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface CrewGuestRow {
  registration_id: string;
  bib: string | null;
  runner: string;
  guest: string;
  position: number;
  submitted_at: string;
}

/** Every registered guest, sorted by bib then list order. Organizers only (RLS). */
export async function loadCrewGuests(supabase: Client, raceId: string): Promise<CrewGuestRow[]> {
  const { data, error } = await supabase
    .from("crew_guests")
    .select("registration_id, full_name, position, submitted_at, registrations(bib, participants(first_name, last_name))")
    .eq("race_id", raceId)
    .eq("active", true);
  if (error) throw error;
  type Row = { registration_id: string; full_name: string; position: number; submitted_at: string; registrations: { bib: string | null; participants: { first_name: string; last_name: string } } };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      registration_id: r.registration_id,
      bib: r.registrations.bib,
      runner: `${r.registrations.participants.first_name} ${r.registrations.participants.last_name}`.trim(),
      guest: r.full_name,
      position: r.position,
      submitted_at: r.submitted_at,
    }))
    .sort((a, b) => (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true }) || a.position - b.position);
}

export interface CrewCars {
  cars: number;
  plates: string | null;
}

/** Car count per runner, keyed by registration id. Organizers only (RLS). */
export async function loadCrewCars(supabase: Client, raceId: string): Promise<Map<string, CrewCars>> {
  const { data, error } = await supabase.from("crew_cars").select("registration_id, cars, plates").eq("race_id", raceId);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.registration_id as string, { cars: r.cars as number, plates: r.plates as string | null }]));
}

export const CREW_EXPORT_HEADER = ["Dorsal", "Corredor", "Invitado", "Núm. invitado", "Autos del corredor", "Placas", "Enviado"];
