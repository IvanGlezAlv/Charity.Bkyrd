"use server";

import { revalidatePath } from "next/cache";
import { requireActionRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { fromLocalInputValue } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function correctEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("timer");
    const race = await getActiveRace();
    const id = String(form.get("event_id") ?? "");
    const local = String(form.get("recorded_at") ?? "");
    if (!race || !UUID.test(id)) return { ok: false, message: "Solicitud inválida." };
    const at = local ? fromLocalInputValue(local, race.timezone) : null;
    if (!at) return { ok: false, message: "Escribe la hora corregida." };
    const { error } = await supabase.rpc("correct_timing_event", { p_event_id: id, p_recorded_at: at, p_reason: String(form.get("reason") ?? "") });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Hora corregida." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function voidEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("timer");
    const id = String(form.get("event_id") ?? "");
    if (!UUID.test(id)) return { ok: false, message: "Solicitud inválida." };
    const { error } = await supabase.rpc("void_timing_event", { p_event_id: id, p_reason: String(form.get("reason") ?? "") });
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Registro anulado." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}
