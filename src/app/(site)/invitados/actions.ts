"use server";

import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { type CrewFormValues, MAX_CARS, MAX_GUESTS, RUNNER_MISMATCH } from "@/lib/crew";

/** Public: saves (or replaces) the guest list and car count of the runner identified by bib + name. */
export async function submitCrewGuests(_prev: ActionState, form: FormData): Promise<ActionState> {
  const bib = String(form.get("bib") ?? "").trim();
  const name = String(form.get("runner_name") ?? "").trim();
  const guests = form.getAll("guest").map((g) => String(g).trim()).filter(Boolean);
  const carsText = String(form.get("cars") ?? "").trim();
  const plates = String(form.get("plates") ?? "").trim();
  // Echoed back on errors so the form keeps what was typed.
  const data: CrewFormValues = { bib, runner_name: name, guests, cars: carsText, plates };
  const cars = Number(carsText);
  const errors: Record<string, string> = {};
  if (!bib) errors.bib = "Escribe tu número de dorsal.";
  if (!name) errors.runner_name = "Escribe tu nombre.";
  if (guests.length === 0) errors.guest = "Agrega al menos un invitado.";
  if (guests.length > MAX_GUESTS) errors.guest = `Máximo ${MAX_GUESTS} invitados.`;
  if (!carsText || !Number.isInteger(cars) || cars < 0 || cars > MAX_CARS) errors.cars = `Escribe cuántos autos llevarán (0 a ${MAX_CARS}).`;
  if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors, data };

  try {
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const supabase = await createClient();
    const { data: count, error } = await supabase.rpc("submit_crew", {
      p_race_id: race.id, p_bib: bib, p_runner_name: name, p_guests: guests, p_cars: cars, p_plates: plates,
    });
    if (error) throw error;
    const n = Number(count);
    const carsLabel = cars === 1 ? "1 auto" : `${cars} autos`;
    return { ok: true, message: `Listo. Registramos ${n} ${n === 1 ? "invitado" : "invitados"} y ${carsLabel}. Si lo envías de nuevo, la lista anterior se reemplaza.` };
  } catch (err) {
    return { ok: false, message: errorMessage(err), data };
  }
}

function errorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/Bib and name do not match/.test(msg)) return RUNNER_MISMATCH;
  if (/Invalid car count/.test(msg)) return `Escribe cuántos autos llevarán (0 a ${MAX_CARS}).`;
  if (/Plates too long/.test(msg)) return "Las placas son demasiado largas.";
  if (/Too many guests/.test(msg)) return `Máximo ${MAX_GUESTS} invitados.`;
  if (/Invalid guest name/.test(msg)) return "Revisa los nombres de tus invitados (nombre y apellido).";
  return friendlyError(err);
}
