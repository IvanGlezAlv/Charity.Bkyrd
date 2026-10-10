import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeKey } from "@/lib/import/common";
import type { AdminEntry, Distance, Category, ParticipationStatus } from "@/lib/types";
import { PARTICIPATION_LABEL } from "@/lib/labels";

const SELECT = "id, bib, status, status_reason, public_listing, signup_seq, distance_id, category_id, participant:participants(*)";

/** Every registration of the race with its participant, in sign-up order. Caller must be an organizer. */
export async function loadEntries(supabase: SupabaseClient, raceId: string): Promise<AdminEntry[]> {
  const { data, error } = await supabase.from("registrations").select(SELECT).eq("race_id", raceId).order("signup_seq");
  if (error) throw error;
  return (data ?? []) as unknown as AdminEntry[];
}

export async function loadEntry(supabase: SupabaseClient, raceId: string, registrationId: string): Promise<AdminEntry | null> {
  const { data, error } = await supabase.from("registrations").select(SELECT).eq("race_id", raceId).eq("id", registrationId).maybeSingle();
  if (error) throw error;
  return data as unknown as AdminEntry | null;
}

export interface EntryFilter {
  q?: string;
  status?: string;
  distance?: string;
  missing?: string;
}

/** What needs attention before race day. */
export function entryGaps(e: AdminEntry): string[] {
  const p = e.participant;
  const gaps: string[] = [];
  if (!e.bib) gaps.push("Sin dorsal");
  if (!p.email) gaps.push("Sin correo");
  if (!p.phone) gaps.push("Sin teléfono");
  if (!p.emergency_contact_phone) gaps.push("Sin tel. de emergencia");
  if (!p.gender) gaps.push("Sin sexo");
  return gaps;
}

export function filterEntries(entries: AdminEntry[], f: EntryFilter): AdminEntry[] {
  const q = normalizeKey(f.q ?? "");
  return entries.filter((e) => {
    if (f.status && e.status !== f.status) return false;
    if (f.distance && e.distance_id !== f.distance) return false;
    if (f.missing === "bib" && e.bib) return false;
    if (f.missing === "any" && entryGaps(e).length === 0) return false;
    if (!q) return true;
    const p = e.participant;
    const hay = normalizeKey([e.bib, p.first_name, p.last_name, p.email, p.phone, p.club, p.external_ref].filter(Boolean).join(" "));
    return q.split(" ").every((t) => hay.includes(t));
  });
}

export const EXPORT_HEADER = [
  "Orden", "Dorsal", "Nombre", "Apellidos", "Distancia", "Categoría", "Sexo", "Edad", "Fecha de nacimiento", "Talla",
  "Correo", "Teléfono", "Contacto de emergencia", "Teléfono de emergencia", "Notas médicas", "Club", "Ciudad",
  "Estado", "Motivo de estado", "Aparece en listas públicas", "Notas internas", "Referencia externa",
];

export function exportRows(entries: AdminEntry[], distances: Distance[], categories: Category[]): unknown[][] {
  const dist = new Map(distances.map((d) => [d.id, d.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  return entries.map((e, i) => {
    const p = e.participant;
    return [
      i + 1, e.bib, p.first_name, p.last_name, dist.get(e.distance_id), e.category_id ? cat.get(e.category_id) : "", p.gender, p.age, p.birth_date,
      p.shirt_size, p.email, p.phone, p.emergency_contact_name, p.emergency_contact_phone, p.medical_notes, p.club, p.city,
      PARTICIPATION_LABEL[e.status as ParticipationStatus], e.status_reason, e.public_listing ? "Sí" : "No", p.internal_notes, p.external_ref,
    ];
  });
}
