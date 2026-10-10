// Shared helpers for spreadsheet imports.

export type Cell = string | number | boolean | Date | null | undefined;
export type Issue = { level: "error" | "warning"; field?: string; message: string };

/** Lowercase, strip accents and punctuation: "Teléfono de Emergencia" -> "telefono de emergencia". */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cellToString(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value).trim();
}

/** Maps raw header cells to canonical field names using a synonym table. */
export function mapHeaders(headers: Cell[], synonyms: Record<string, string[]>): { fields: (string | null)[]; unknown: string[] } {
  const lookup = new Map<string, string>();
  for (const [field, names] of Object.entries(synonyms)) {
    lookup.set(normalizeKey(field), field);
    for (const n of names) lookup.set(normalizeKey(n), field);
  }
  const unknown: string[] = [];
  const seen = new Set<string>();
  const fields = headers.map((h) => {
    const raw = cellToString(h);
    if (!raw) return null;
    const field = lookup.get(normalizeKey(raw)) ?? null;
    if (!field) unknown.push(raw);
    if (field && seen.has(field)) return null; // first matching column wins
    if (field) seen.add(field);
    return field;
  });
  return { fields, unknown };
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY (day first), or an Excel Date cell. Returns YYYY-MM-DD or null. */
export function parseDateCell(value: Cell): string | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "invalid";
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return "invalid";
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "invalid";
  return date.toISOString().slice(0, 10);
}

export function normalizeGender(value: string): "F" | "M" | "X" | null | "invalid" {
  if (!value.trim()) return null;
  const k = normalizeKey(value);
  if (["f", "femenino", "mujer", "female", "woman", "w", "fem"].includes(k)) return "F";
  if (["m", "masculino", "hombre", "male", "man", "varon", "masc"].includes(k)) return "M";
  if (["x", "otro", "no binario", "nonbinary", "non binary", "nb", "other"].includes(k)) return "X";
  return "invalid";
}

export const BIB_PATTERN = /^[A-Za-z0-9-]{1,12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_PATTERN.test(s);

/** Bibs like "007" and "7" are the same physical number only if staff typed them so; we keep them as text. */
export function normalizeBib(value: Cell): string {
  const s = cellToString(value);
  return /^\d+\.0$/.test(s) ? s.slice(0, -2) : s;
}
