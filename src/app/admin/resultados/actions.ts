"use server";

import { revalidatePath } from "next/cache";
import { requireActionRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";

const OPTIONS = ["hidden", "provisional", "official"] as const;

export async function setPublication(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const target = String(form.get("publication"));
    // Official (and leaving official) is admin-only; the database checks it again.
    const { supabase } = await requireActionRole(target === "official" ? "admin" : "organizer");
    const race = await getActiveRace();
    if (!race || !OPTIONS.includes(target as (typeof OPTIONS)[number])) return { ok: false, message: "Solicitud inválida." };
    const { error } = await supabase.rpc("set_results_publication", {
      p_race_id: race.id,
      p_publication: target,
      p_reason: String(form.get("reason") ?? "").trim() || null,
    });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/admin", "layout");
    revalidatePath("/resultados");
    return { ok: true, message: "Publicación actualizada." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}
