"use server";

import { planBibs } from "@/lib/admin/bibs";
import { revalidatePath } from "next/cache";
import { requireActionRole } from "@/lib/auth";
import { getActiveRace, getCategories, getDistances } from "@/lib/data";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { previewParticipants, type ExistingEntry, type ParticipantPreview } from "@/lib/import/participants";
import { readSpreadsheet, SheetError } from "@/lib/import/read";
import { BIB_PATTERN, isEmail, normalizeGender } from "@/lib/import/common";
import type { ParticipationStatus } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: ParticipationStatus[] = ["registered", "started", "finished", "dns", "dnf", "dsq"];

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/corredores");
  revalidatePath("/resultados");
}

async function importContext(raceId: string) {
  const { supabase } = await requireActionRole("organizer");
  const [distances, categories, { data: existing, error }] = await Promise.all([
    getDistances(raceId),
    getCategories(raceId),
    supabase.from("registrations").select("participant_id, bib, participants(first_name,last_name,birth_date,email,external_ref)").eq("race_id", raceId),
  ]);
  if (error) throw error;
  type Row = { participant_id: string; bib: string | null; participants: { first_name: string; last_name: string; birth_date: string | null; email: string | null; external_ref: string | null } };
  return {
    distances: distances.map((d) => ({ slug: d.slug, name: d.name })),
    categories: categories.map((c) => ({ code: c.code, name: c.name })),
    existing: ((existing ?? []) as unknown as Row[]).map<ExistingEntry>((r) => ({
      participant_id: r.participant_id,
      bib: r.bib,
      external_ref: r.participants.external_ref,
      first_name: r.participants.first_name,
      last_name: r.participants.last_name,
      birth_date: r.participants.birth_date,
      email: r.participants.email,
    })),
  };
}

async function sheetFromForm(form: FormData) {
  const file = form.get("file");
  const pasted = String(form.get("pasted") ?? "");
  if (file instanceof File && file.size > 0) return readSpreadsheet(file);
  if (pasted.trim()) return readSpreadsheet(pasted);
  throw new SheetError("Sube un archivo o pega los datos.");
}

export async function previewParticipantImport(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const preview = previewParticipants(await sheetFromForm(form), await importContext(race.id));
    return { ok: true, message: "", data: preview };
  } catch (err) {
    return { ok: false, message: err instanceof SheetError ? err.message : friendlyError(err) };
  }
}

/** Re-reads and re-validates the same input on the server, then imports only rows without errors. */
export async function commitParticipantImport(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const strategy = String(form.get("strategy"));
    if (strategy !== "create_only" && strategy !== "update_existing") return { ok: false, message: "Elige una estrategia de importación." };
    const preview: ParticipantPreview = previewParticipants(await sheetFromForm(form), await importContext(race.id));
    if (preview.missingColumns.length) return { ok: false, message: `Faltan columnas: ${preview.missingColumns.join(", ")}` };
    const valid = preview.rows.filter((r) => !r.issues.some((i) => i.level === "error"));
    if (valid.length === 0) return { ok: false, message: "No hay filas válidas para importar." };
    const { data, error } = await supabase.rpc("import_participants", {
      p_race_id: race.id,
      p_rows: valid.map((r) => r.data),
      p_strategy: strategy,
    });
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    const res = data as { created: number; updated: number; skipped: number };
    const excluded = preview.rows.length - valid.length;
    return {
      ok: true,
      message: `Importación completa: ${res.created} nuevos, ${res.updated} actualizados, ${res.skipped} omitidos (ya existían)${excluded ? `, ${excluded} filas con errores no importadas` : ""}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof SheetError ? err.message : friendlyError(err) };
  }
}

export async function saveParticipant(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const s = (k: string) => String(form.get(k) ?? "").trim();
    const errors: Record<string, string> = {};
    const participantId = s("participant_id");
    const registrationId = s("registration_id");
    if ((participantId && !UUID.test(participantId)) || (registrationId && !UUID.test(registrationId))) return { ok: false, message: "Solicitud inválida." };

    const first = s("first_name");
    if (!first) errors.first_name = "Obligatorio";
    const email = s("email").toLowerCase();
    if (email && !isEmail(email)) errors.email = "Correo inválido";
    const gender = normalizeGender(s("gender"));
    if (gender === "invalid") errors.gender = "Opción inválida";
    const age = s("age") ? Number(s("age")) : null;
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) errors.age = "Edad inválida";
    const birth = s("birth_date") || null;
    if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) errors.birth_date = "Fecha inválida";
    const bib = s("bib") || null;
    if (bib && !BIB_PATTERN.test(bib)) errors.bib = "Solo letras, números y guiones (máx. 12)";

    const [distances, categories] = await Promise.all([getDistances(race.id), getCategories(race.id)]);
    const distanceId = s("distance_id");
    if (!distances.some((d) => d.id === distanceId)) errors.distance_id = "Elige una distancia";
    const categoryId = s("category_id") || null;
    if (categoryId && !categories.some((c) => c.id === categoryId)) errors.category_id = "Categoría inválida";
    if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors };

    const participant = {
      first_name: first,
      last_name: s("last_name"),
      email: email || null,
      phone: s("phone") || null,
      birth_date: birth,
      age,
      gender: gender || null,
      shirt_size: s("shirt_size").toUpperCase() || null,
      nationality: s("nationality") || null,
      city: s("city") || null,
      club: s("club") || null,
      emergency_contact_name: s("emergency_contact_name") || null,
      emergency_contact_phone: s("emergency_contact_phone") || null,
      medical_notes: s("medical_notes") || null,
      internal_notes: s("internal_notes") || null,
      external_ref: s("external_ref") || null,
    };
    const registration = { bib, distance_id: distanceId, category_id: categoryId, public_listing: form.get("public_listing") === "on" };

    if (participantId && registrationId) {
      const { error: e1 } = await supabase.from("participants").update(participant).eq("id", participantId).eq("race_id", race.id);
      if (e1) return { ok: false, message: friendlyError(e1) };
      const { error: e2 } = await supabase.from("registrations").update(registration).eq("id", registrationId).eq("race_id", race.id);
      if (e2) return { ok: false, message: friendlyError(e2) };
    } else {
      const { data: p, error: e1 } = await supabase.from("participants").insert({ ...participant, race_id: race.id }).select("id").single();
      if (e1) return { ok: false, message: friendlyError(e1) };
      const { error: e2 } = await supabase.from("registrations").insert({ ...registration, race_id: race.id, participant_id: p.id });
      if (e2) {
        await supabase.from("participants").delete().eq("id", p.id);
        return { ok: false, message: friendlyError(e2) };
      }
    }
    refresh();
    return { ok: true, message: "Corredor guardado." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function deleteParticipant(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const id = String(form.get("participant_id") ?? "");
    if (!race || !UUID.test(id)) return { ok: false, message: "Solicitud inválida." };
    const { count } = await supabase.from("timing_events").select("id", { count: "exact", head: true })
      .eq("race_id", race.id).in("registration_id", (await supabase.from("registrations").select("id").eq("participant_id", id)).data?.map((r) => r.id) ?? []);
    if ((count ?? 0) > 0) return { ok: false, message: "Este corredor tiene tiempos registrados. Márcalo como DNS/DNF en lugar de eliminarlo." };
    const { error } = await supabase.from("participants").delete().eq("id", id).eq("race_id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "Corredor eliminado." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function setStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("timer");
    const id = String(form.get("registration_id") ?? "");
    const status = String(form.get("status") ?? "") as ParticipationStatus;
    if (!UUID.test(id) || !STATUSES.includes(status)) return { ok: false, message: "Solicitud inválida." };
    const { error } = await supabase.rpc("set_participation_status", {
      p_registration_id: id, p_status: status, p_reason: String(form.get("reason") ?? "") || null,
    });
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "Estado actualizado." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

/** Gives a bib to every runner without one, in alphabetical or registration order, skipping numbers in use. */
export async function assignBibs(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const start = Number(form.get("start") || 1);
    const width = Number(form.get("width") || 3);
    const order = String(form.get("order") || "signup");
    if (!Number.isInteger(start) || start < 0 || start > 99999) return { ok: false, message: "Número inicial inválido." };
    if (!Number.isInteger(width) || width < 1 || width > 6) return { ok: false, message: "Cantidad de dígitos inválida." };
    const { data, error } = await supabase.from("registrations")
      .select("id, bib, signup_seq, participants(first_name,last_name)").eq("race_id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    type Row = { id: string; bib: string | null; signup_seq: number; participants: { first_name: string; last_name: string } };
    const rows = (data ?? []) as unknown as Row[];
    const pending = rows.filter((r) => !r.bib);
    if (pending.length === 0) return { ok: true, message: "Todos los corredores ya tienen dorsal." };
    pending.sort((a, b) =>
      order === "alpha"
        ? `${a.participants.last_name} ${a.participants.first_name}`.localeCompare(`${b.participants.last_name} ${b.participants.first_name}`, "es", { sensitivity: "base" })
        : a.signup_seq - b.signup_seq,
    );
    const bibs = planBibs(rows.map((r) => r.bib).filter((b): b is string => Boolean(b)), pending.length, start, width);
    let assigned = 0;
    for (const [i, r] of pending.entries()) {
      const { error: e } = await supabase.from("registrations").update({ bib: bibs[i] }).eq("id", r.id).is("bib", null);
      if (e) return { ok: false, message: `Se asignaron ${assigned} dorsales y luego falló: ${friendlyError(e)}` };
      assigned++;
    }
    refresh();
    return { ok: true, message: `${assigned} dorsales asignados (del ${bibs[0]} al ${bibs[bibs.length - 1]}).` };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}
