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
  for (const [pattern, text] of DB_MESSAGES) {
    const m = msg.match(pattern);
    if (m) return typeof text === "function" ? text(m) : text;
  }
  return msg;
}

/** Spanish wording for the exceptions raised by the database functions. */
const DB_MESSAGES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/The race has not started yet/, "La carrera aún no ha empezado."],
  [/Timestamp is in the future/, "La hora está en el futuro. Revisa el reloj del dispositivo."],
  [/Runner is marked (\w+)/, (m) => `El corredor está marcado como ${m[1]}. Cambia su estado antes de registrar tiempos.`],
  [/Results are official/, "Los resultados son oficiales. Un administrador debe reabrirlos antes de cambiar tiempos."],
  [/A reason is required to overwrite/, "Escribe un motivo para sobrescribir el tiempo registrado."],
  [/A reason is required for this status change/, "Escribe un motivo para este cambio de estado."],
  [/A reason is required to reopen/, "Escribe un motivo para reabrir los resultados oficiales."],
  [/A reason is required/, "Escribe un motivo."],
  [/A corrected time is required/, "Escribe la hora corregida."],
  [/Set the start time of (.+) before recording laps/, (m) => `Configura la hora de salida de ${m[1]} antes de registrar vueltas.`],
  [/Backyard races record laps/, "En backyard solo se registran vueltas."],
  [/Fixed-distance races do not record laps/, "En carreras de distancia fija no se registran vueltas."],
  [/Checkpoint does not belong/, "Ese punto de control no pertenece al recorrido del corredor."],
  [/This record was already removed/, "Ese registro ya fue anulado."],
  [/(Active )?[Tt]iming record not found/, "No se encontró el registro de tiempo."],
  [/Runner not found/, "No se encontró al corredor en esta carrera."],
  [/Only administrators can publish or reopen/, "Solo un administrador puede publicar o reabrir resultados oficiales."],
  [/Row (\d+): unknown distance "(.*)"/, (m) => `Fila ${m[1]}: distancia desconocida "${m[2]}".`],
  [/Row (\d+): unknown category "(.*)"/, (m) => `Fila ${m[1]}: categoría desconocida "${m[2]}".`],
  [/Row (\d+): bib number or external reference already belongs/, (m) => `Fila ${m[1]}: el dorsal o la referencia ya pertenece a otro corredor.`],
  [/Failed to fetch|NetworkError|Load failed/, "Sin conexión con el servidor."],
];
