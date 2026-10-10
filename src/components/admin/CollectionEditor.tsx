import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { COLLECTIONS } from "@/lib/admin/collections";
import { formatDateTime } from "@/lib/time";
import type { Race } from "@/lib/types";
import { CollectionForm, DeleteForm } from "./CollectionForm";
import type { RefOptions } from "./FieldInput";

/** Lists a content table for the active race with inline edit, create and delete. */
export async function CollectionEditor({ collectionKey, race, extra }: {
  collectionKey: string;
  race: Race;
  /** Optional extra controls rendered under each row's form (e.g. GPX upload). */
  extra?: (row: Record<string, unknown>) => ReactNode;
}) {
  const def = COLLECTIONS[collectionKey];
  const supabase = await createClient();
  let q = supabase.from(def.table).select("*").eq("race_id", race.id);
  for (const [k, v] of Object.entries(def.fixed ?? {})) q = q.eq(k, v);
  for (const o of def.orderBy) q = q.order(o.column, { ascending: o.ascending, nullsFirst: false });
  const [{ data: rows, error }, { data: locs }, { data: dists }] = await Promise.all([
    q,
    supabase.from("locations").select("id,name").eq("race_id", race.id).order("sort_order"),
    supabase.from("race_distances").select("id,name").eq("race_id", race.id).order("sort_order"),
  ]);
  const refs: RefOptions = {
    locations: (locs ?? []).map((l) => ({ value: l.id as string, label: l.name as string })),
    distances: (dists ?? []).map((d) => ({ value: d.id as string, label: d.name as string })),
  };
  const summaryFields = def.fields.filter((f) => f.summary);
  const defaults: Record<string, unknown> = Object.fromEntries(
    def.fields.map((f) => [f.name, f.type === "checkbox" ? (f.name === "is_timed" || f.name === "is_pinned" ? false : true) : null]),
  );

  const display = (row: Record<string, unknown>, name: string) => {
    const f = def.fields.find((x) => x.name === name)!;
    const v = row[name];
    if (v === null || v === undefined || v === "") return null;
    if (f.type === "datetime") return formatDateTime(String(v), race.timezone);
    if (f.type === "select") return f.options?.find((o) => o.value === v)?.label ?? String(v);
    if (f.type === "ref") return (f.ref ? refs[f.ref] : [])?.find((o) => o.value === v)?.label ?? "";
    return String(v);
  };

  return (
    <section className="mb-12">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-4xl">{def.title}</h2>
        <span className="eyebrow text-ink-3">{rows?.length ?? 0}</span>
      </div>
      {def.description && <p className="mb-4 max-w-3xl text-ink-2">{def.description}</p>}
      {error && <p role="alert" className="text-signal">{error.message}</p>}
      <ul className="divide-y divide-line border-y-2 border-ink">
        {(rows ?? []).map((row) => (
          <li key={row.id as string}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 py-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
                <span className="font-mono text-ink-3 transition-transform group-open:rotate-90" aria-hidden>›</span>
                <span className="font-bold">{String(row[def.titleField] ?? "Sin título")}</span>
                {summaryFields.map((f) => {
                  const v = display(row, f.name);
                  return v ? <span key={f.name} className="eyebrow text-ink-2">{v}</span> : null;
                })}
                {(row.is_published === false || row.is_public === false) && <span className="eyebrow text-signal">Oculto</span>}
              </summary>
              <div className="space-y-6 border-t border-line bg-paper-2/50 p-4">
                <CollectionForm collection={def.key} fields={def.fields} values={row} timezone={race.timezone} refs={refs} />
                {extra?.(row)}
                <DeleteForm collection={def.key} id={row.id as string} label={String(row[def.titleField] ?? "")} />
              </div>
            </details>
          </li>
        ))}
        {(rows ?? []).length === 0 && <li className="py-4 text-ink-2">Aún no hay registros.</li>}
      </ul>
      <details className="mt-4 border-2 border-dashed border-ink">
        <summary className="btn btn-ghost w-full cursor-pointer list-none border-0 [&::-webkit-details-marker]:hidden">+ Agregar {def.singular}</summary>
        <div className="p-4">
          <CollectionForm collection={def.key} fields={def.fields} values={defaults} timezone={race.timezone} refs={refs} submitLabel="Crear" resetOnSuccess />
        </div>
      </details>
    </section>
  );
}
