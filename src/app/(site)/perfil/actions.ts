"use server";

import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { RUNNER_MISMATCH } from "@/lib/crew";
import { PROFILE_FIELDS, profileMaxLength, type RunnerProfile } from "@/lib/runner-profile";

export interface ProfileFormValues extends RunnerProfile {
  bib: string;
  runner_name: string;
}

/** Public: saves (or replaces) the livestream profile of the runner identified by bib + name. */
export async function submitRunnerProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const bib = String(form.get("bib") ?? "").trim();
  const name = String(form.get("runner_name") ?? "").trim();
  const profile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.name, String(form.get(f.name) ?? "").trim()])) as RunnerProfile;
  // Echoed back on errors so the form keeps what was typed.
  const data: ProfileFormValues = { bib, runner_name: name, ...profile };
  const errors: Record<string, string> = {};
  if (!bib) errors.bib = "Escribe tu número de dorsal.";
  if (!name) errors.runner_name = "Escribe tu nombre.";
  for (const f of PROFILE_FIELDS) {
    if (profile[f.name].length > profileMaxLength(f.long)) errors[f.name] = `Máximo ${profileMaxLength(f.long)} caracteres.`;
  }
  if (!PROFILE_FIELDS.some((f) => profile[f.name])) errors.form = "Contesta al menos una pregunta.";
  if (Object.keys(errors).length) return { ok: false, message: errors.form ?? "Revisa los campos marcados.", errors, data };

  try {
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_runner_profile", {
      p_race_id: race.id, p_bib: bib, p_runner_name: name, p_profile: profile,
    });
    if (error) throw error;
    return { ok: true, message: "¡Gracias! Guardamos tu perfil. Si lo envías de nuevo, reemplaza al anterior." };
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? "";
    if (/Bib and name do not match/.test(msg)) return { ok: false, message: RUNNER_MISMATCH, data };
    if (/Profile field too long/.test(msg)) return { ok: false, message: "Alguna respuesta es demasiado larga.", data };
    return { ok: false, message: friendlyError(err), data };
  }
}
