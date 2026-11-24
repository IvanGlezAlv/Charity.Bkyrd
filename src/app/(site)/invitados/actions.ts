"use server";

import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { type CrewFormValues, MAX_CARS, MAX_GUESTS } from "@/lib/crew";

/**
 * Public: saves a new guest list for the access list at the caseta. Runners
 * are identified by bib + name; anyone else submits with their own name.
 * Earlier lists are always kept.
 */
export async function submitCrewGuests(_prev: ActionState, form: FormData): Promise<ActionState> {
  const kind = form.get("kind") === "guest" ? "guest" : "runner";
  const isRunner = kind === "runner";
  const bib = isRunner ? String(form.get("bib") ?? "").trim() : "";
  const name = String(form.get(isRunner ? "runner_name" : "guest_name") ?? "").trim();
  const withRunner = isRunner ? "" : String(form.get("with_runner") ?? "").trim();
  const guests = form.getAll("guest").map((g) => String(g).trim()).filter(Boolean);
  const carsText = String(form.get("cars") ?? "").trim();
  const plates = String(form.get("plates") ?? "").trim();
  // Echoed back on errors so the form keeps what was typed.
  const data: CrewFormValues = { kind, bib, name, with_runner: withRunner, guests, cars: carsText, plates };
  const cars = Number(carsText);
  const errors: Record<string, string> = {};
  if (isRunner && !bib) errors.bib = "Escribe tu número de dorsal.";
  if (name.length < 2) errors.name = "Escribe tu nombre y apellido.";
  if (withRunner.length > 120) errors.with_runner = "El nombre es demasiado largo.";
  if (guests.length === 0) errors.guest = "Agrega al menos un invitado.";
  if (guests.length > MAX_GUESTS) errors.guest = `Máximo ${MAX_GUESTS} invitados por envío. Envía otra lista para el resto.`;
  if (!carsText || !Number.isInteger(cars) || cars < 0 || cars > MAX_CARS) errors.cars = `Escribe cuántos autos llevarán (0 a ${MAX_CARS}).`;
  if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors, data };

  try {
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("submit_guest_list", {
      p_race_id: race.id, p_is_runner: isRunner, p_bib: bib, p_name: name, p_with_runner: withRunner,
      p_guests: guests, p_cars: cars, p_plates: plates,
    });
    if (error) throw error;
    const n = Number(count);
    const carsLabel = cars === 1 ? "1 auto" : `${cars} autos`;
    return {
      ok: true,
      message: `Listo. Agregamos ${n} ${n === 1 ? "persona" : "personas"} y ${carsLabel} a la lista de acceso. Si te faltó alguien, envía otra lista; las anteriores se conservan.`,
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err), data };
  }
}

function errorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/Invalid name/.test(msg)) return "Escribe tu nombre y apellido.";
  if (/Invalid runner name/.test(msg)) return "El nombre del corredor es demasiado largo.";
  if (/Invalid car count/.test(msg)) return `Escribe cuántos autos llevarán (0 a ${MAX_CARS}).`;
  if (/Plates too long/.test(msg)) return "Las placas son demasiado largas.";
  if (/Too many guests/.test(msg)) return `Máximo ${MAX_GUESTS} invitados por envío. Envía otra lista para el resto.`;
  if (/Invalid guest name/.test(msg)) return "Revisa los nombres de tus invitados (nombre y apellido).";
  return friendlyError(err);
}
