"use server";

import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { type CrewFormValues, MAX_GUESTS } from "@/lib/crew";

/** Public: saves (or replaces) the guest list of the runner identified by bib + name. */
export async function submitCrewGuests(_prev: ActionState, form: FormData): Promise<ActionState> {
  const bib = String(form.get("bib") ?? "").trim();
  const name = String(form.get("runner_name") ?? "").trim();
  const guests = form.getAll("guest").map((g) => String(g).trim()).filter(Boolean);
  // Echoed back on errors so the form keeps what was typed.
  const data: CrewFormValues = { bib, runner_name: name, guests };
  const errors: Record<string, string> = {};
  if (!bib) errors.bib = "Escribe tu número de dorsal.";
  if (!name) errors.runner_name = "Escribe tu nombre.";
  if (guests.length === 0) errors.guest = "Agrega al menos un invitado.";
  if (guests.length > MAX_GUESTS) errors.guest = `Máximo ${MAX_GUESTS} invitados.`;
  if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors, data };

  try {
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("submit_crew_guests", {
      p_race_id: race.id, p_bib: bib, p_runner_name: name, p_guests: guests,
    });
    if (error) throw error;
    const n = Number(count);
    return { ok: true, message: `Listo. Registramos ${n} ${n === 1 ? "invitado" : "invitados"}. Si lo envías de nuevo, la lista anterior se reemplaza.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err), data };
  }
}

function errorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/Bib and name do not match/.test(msg)) return "El dorsal y el nombre no coinciden con la lista de corredores. Revisa tu número en la página de Corredores.";
  if (/Too many guests/.test(msg)) return `Máximo ${MAX_GUESTS} invitados.`;
  if (/Invalid guest name/.test(msg)) return "Revisa los nombres de tus invitados (nombre y apellido).";
  return friendlyError(err);
}
