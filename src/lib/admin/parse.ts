import { fromLocalInputValue } from "../time";
import type { FieldDef } from "./collections";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldErrors = Record<string, string>;

/**
 * Validates and converts submitted form values according to the field
 * definitions. Image fields are skipped (uploads are handled separately).
 * Datetimes are interpreted as wall-clock time in the race timezone.
 */
export function parseFields(
  fields: FieldDef[],
  form: FormData,
  timezone: string,
  allowedRefs: Record<string, Set<string>> = {},
): { values: Record<string, unknown>; errors: FieldErrors } {
  const values: Record<string, unknown> = {};
  const errors: FieldErrors = {};

  for (const f of fields) {
    if (f.type === "image") continue;
    if (f.type === "checkbox") {
      values[f.name] = form.get(f.name) === "on" || form.get(f.name) === "true";
      continue;
    }
    const raw = String(form.get(f.name) ?? "").trim();
    if (!raw) {
      if (f.required) errors[f.name] = "Obligatorio";
      values[f.name] = f.type === "links" ? [] : null;
      continue;
    }
    if (f.maxLength && raw.length > f.maxLength) {
      errors[f.name] = `Máximo ${f.maxLength} caracteres`;
      continue;
    }
    switch (f.type) {
      case "number":
      case "integer": {
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n) || (f.type === "integer" && !Number.isInteger(n))) errors[f.name] = f.type === "integer" ? "Número entero" : "Número inválido";
        else if (f.min !== undefined && n < f.min) errors[f.name] = `Mínimo ${f.min}`;
        else if (f.max !== undefined && n > f.max) errors[f.name] = `Máximo ${f.max}`;
        else values[f.name] = n;
        break;
      }
      case "select":
        if (f.options && !f.options.some((o) => o.value === raw)) errors[f.name] = "Opción inválida";
        else values[f.name] = raw;
        break;
      case "ref":
        if (!UUID.test(raw) || (f.ref && allowedRefs[f.ref] && !allowedRefs[f.ref].has(raw))) errors[f.name] = "Selección inválida";
        else values[f.name] = raw;
        break;
      case "datetime": {
        const iso = fromLocalInputValue(raw, timezone);
        if (!iso) errors[f.name] = "Fecha y hora inválidas";
        else values[f.name] = iso;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) errors[f.name] = "Fecha inválida";
        else values[f.name] = raw;
        break;
      case "url":
        try {
          const u = new URL(raw);
          if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
          values[f.name] = u.toString();
        } catch {
          errors[f.name] = "URL inválida (debe empezar con https://)";
        }
        break;
      case "email":
        if (!EMAIL.test(raw)) errors[f.name] = "Correo inválido";
        else values[f.name] = raw.toLowerCase();
        break;
      case "links": {
        const links: { label: string; url: string }[] = [];
        for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          const [label, url] = line.split("|").map((x) => x.trim());
          try {
            const u = new URL(url ?? "");
            if (!label || (u.protocol !== "https:" && u.protocol !== "http:")) throw new Error();
            links.push({ label: label.slice(0, 40), url: u.toString() });
          } catch {
            errors[f.name] = `Línea inválida: "${line}"`;
          }
        }
        values[f.name] = links;
        break;
      }
      default:
        if (f.name === "slug" || f.name.endsWith("_slug")) {
          if (!SLUG.test(raw)) {
            errors[f.name] = "Solo minúsculas, números y guiones";
            break;
          }
        }
        values[f.name] = raw;
    }
  }
  return { values, errors };
}
