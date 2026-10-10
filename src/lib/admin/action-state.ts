export interface ActionState {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  /** Free-form payload for actions that return data (e.g. import previews). */
  data?: unknown;
}

export const initialState: ActionState = { ok: false, message: "" };

/** Turns database / auth errors into messages safe and useful for staff. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string; hint?: string };
  const msg = e?.message ?? String(err);
  if (e?.code === "23505" || /duplicate key/.test(msg)) {
    if (/bib/.test(msg)) return "Ese dorsal ya está asignado a otro corredor.";
    if (/slug/.test(msg)) return "Ese identificador ya existe.";
    return "Ya existe un registro con esos datos.";
  }
  if (e?.code === "42501" || /row-level security|permission denied|Not authorized/i.test(msg)) return "No tienes permiso para esta acción.";
  if (e?.code === "23503") return "El registro está en uso por otros datos y no se puede eliminar o cambiar.";
  return msg;
}
