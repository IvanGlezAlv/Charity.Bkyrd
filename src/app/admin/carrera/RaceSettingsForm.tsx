"use client";

import { useActionState } from "react";
import { RACE_FIELDS } from "@/lib/admin/collections";
import { initialState } from "@/lib/admin/action-state";
import { FieldInput } from "@/components/admin/FieldInput";
import { Feedback } from "@/components/admin/Feedback";
import type { Race } from "@/lib/types";
import { saveRaceSettings } from "../content-actions";

const WIDE = new Set(["markdown", "textarea", "links", "image"]);

export function RaceSettingsForm({ race }: { race: Race }) {
  const [state, action, pending] = useActionState(saveRaceSettings, initialState);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {RACE_FIELDS.map((f) => (
          <div key={f.name} className={WIDE.has(f.type) ? "md:col-span-2" : ""}>
            <FieldInput field={f} value={(race as unknown as Record<string, unknown>)[f.name]} error={state.errors?.[f.name]} timezone={race.timezone} refs={{}} idPrefix="race" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Guardando…" : "Guardar configuración"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
