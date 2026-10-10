"use client";

import type { FieldDef } from "@/lib/admin/collections";
import { storageUrl } from "@/lib/env";
import { toLocalInputValue } from "@/lib/time";

export type RefOptions = Partial<Record<"locations" | "distances", { value: string; label: string }[]>>;

export function FieldInput({ field, value, error, timezone, refs, idPrefix }: {
  field: FieldDef;
  value: unknown;
  error?: string;
  timezone: string;
  refs: RefOptions;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${field.name}`;
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, name: field.name, "aria-invalid": Boolean(error) || undefined, "aria-describedby": describedBy };
  const str = value === null || value === undefined ? "" : String(value);

  let input: React.ReactNode;
  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" {...common} defaultChecked={value === true} className="h-5 w-5 accent-ink" />
          <span>{field.label}</span>
        </label>
      );
    case "textarea":
    case "markdown":
      input = <textarea {...common} defaultValue={str} rows={field.type === "markdown" ? 10 : 4} maxLength={field.maxLength} className={`field ${field.type === "markdown" ? "font-mono text-sm" : ""}`} required={field.required} />;
      break;
    case "select":
      input = (
        <select {...common} defaultValue={str} className="field" required={field.required}>
          {!field.required && !field.options?.some((o) => o.value === "") && <option value="">—</option>}
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case "ref":
      input = (
        <select {...common} defaultValue={str} className="field" required={field.required}>
          <option value="">—</option>
          {(field.ref ? refs[field.ref] ?? [] : []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case "datetime":
      input = <input type="datetime-local" {...common} defaultValue={toLocalInputValue(str || null, timezone)} className="field" required={field.required} />;
      break;
    case "date":
      input = <input type="date" {...common} defaultValue={str} className="field" required={field.required} />;
      break;
    case "number":
    case "integer":
      input = <input type="text" inputMode={field.type === "integer" ? "numeric" : "decimal"} {...common} defaultValue={str} className="field" required={field.required} />;
      break;
    case "links": {
      const links = Array.isArray(value) ? (value as { label: string; url: string }[]) : [];
      input = <textarea {...common} defaultValue={links.map((l) => `${l.label} | ${l.url}`).join("\n")} rows={3} className="field font-mono text-sm" />;
      break;
    }
    case "image": {
      const preview = str ? (str.startsWith("/") ? str : storageUrl(str)) : null;
      input = (
        <div className="flex flex-wrap items-center gap-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-16 w-auto border border-line bg-white object-contain p-1" />
          )}
          <input type="file" {...common} accept="image/jpeg,image/png,image/webp" className="text-sm" />
          {preview && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`${field.name}__remove`} className="accent-signal" /> Quitar
            </label>
          )}
        </div>
      );
      break;
    }
    default:
      input = <input type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"} {...common} defaultValue={str} maxLength={field.maxLength} className="field" required={field.required} />;
  }

  return (
    <div>
      <label htmlFor={id} className="label">{field.label}{field.required && <span className="text-signal"> *</span>}</label>
      {input}
      {field.help && <p id={`${id}-help`} className="mt-1 text-xs text-ink-3">{field.help}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-signal">{error}</p>}
    </div>
  );
}
