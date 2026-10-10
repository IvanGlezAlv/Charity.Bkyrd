"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FieldDef } from "@/lib/admin/collections";
import { type ActionState, initialState } from "@/lib/admin/action-state";
import { deleteCollectionItem, saveCollectionItem } from "@/app/admin/content-actions";
import { FieldInput, type RefOptions } from "./FieldInput";
import { Feedback } from "./Feedback";

const WIDE = new Set(["textarea", "markdown", "links", "image"]);

export function CollectionForm({ collection, fields, values, timezone, refs, submitLabel = "Guardar", resetOnSuccess = false }: {
  collection: string;
  fields: FieldDef[];
  values: Record<string, unknown> & { id?: string };
  timezone: string;
  refs: RefOptions;
  submitLabel?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCollectionItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  const idPrefix = `${collection}-${values.id ?? "new"}`;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="__collection" value={collection} />
      {values.id && <input type="hidden" name="__id" value={values.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name} className={WIDE.has(f.type) ? "md:col-span-2" : ""}>
            <FieldInput field={f} value={values[f.name]} error={state.errors?.[f.name]} timezone={timezone} refs={refs} idPrefix={idPrefix} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Guardando…" : submitLabel}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteForm({ collection, id, label }: { collection: string; id: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteCollectionItem, initialState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar “${label}”? Esta acción no se puede deshacer.`)) e.preventDefault();
      }}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="__collection" value={collection} />
      <input type="hidden" name="__id" value={id} />
      <button className="btn btn-ghost border-signal text-signal hover:bg-signal hover:text-white" disabled={pending}>Eliminar</button>
      <Feedback state={state} />
    </form>
  );
}
