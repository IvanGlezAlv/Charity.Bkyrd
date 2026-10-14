"use client";

import { useActionState, useState } from "react";
import { type ActionState, initialState } from "@/lib/admin/action-state";
import { type CrewFormValues, MAX_GUESTS } from "@/lib/crew";
import { Feedback } from "@/components/admin/Feedback";
import { submitCrewGuests } from "./actions";

export function CrewForm() {
  const [state, run, pending] = useActionState(submitCrewGuests, initialState);
  return (
    <form action={run} className="space-y-6">
      {/* React resets the form after each submit; remounting with the echoed values keeps what was typed when there is an error. */}
      <Fields key={submissions(state)} state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Enviando…" : "Enviar lista"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

const seen = new WeakMap<ActionState, number>();
let counter = 0;
function submissions(state: ActionState) {
  if (!seen.has(state)) seen.set(state, counter++);
  return seen.get(state);
}

function Fields({ state }: { state: ActionState }) {
  const values = (state.ok ? undefined : state.data) as CrewFormValues | undefined;
  const initialGuests = values?.guests.length ? values.guests : ["", ""];
  const [rows, setRows] = useState(() => initialGuests.map((value, key) => ({ key, value })));
  const [next, setNext] = useState(initialGuests.length);
  const err = state.errors ?? {};

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="eyebrow">Dorsal</span>
          <input name="bib" defaultValue={values?.bib} inputMode="numeric" autoComplete="off" placeholder="007" className="field mt-1" aria-invalid={Boolean(err.bib) || undefined} required />
          {err.bib && <span className="mt-1 block text-sm text-signal">{err.bib}</span>}
        </label>
        <label className="block">
          <span className="eyebrow">Tu nombre (corredor)</span>
          <input name="runner_name" defaultValue={values?.runner_name} autoComplete="name" placeholder="Nombre y apellido" className="field mt-1" aria-invalid={Boolean(err.runner_name) || undefined} required />
          {err.runner_name && <span className="mt-1 block text-sm text-signal">{err.runner_name}</span>}
        </label>
      </div>

      <fieldset>
        <legend className="eyebrow">Invitados / crew (nombre completo)</legend>
        <ol className="mt-2 space-y-2">
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right font-mono text-sm text-ink-2">{i + 1}.</span>
              <input name="guest" defaultValue={row.value} aria-label={`Invitado ${i + 1}`} placeholder="Nombre y apellido" maxLength={120} className="field" />
              {rows.length > 1 && (
                <button type="button" aria-label={`Quitar invitado ${i + 1}`} className="btn btn-ghost shrink-0 px-3" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>×</button>
              )}
            </li>
          ))}
        </ol>
        {err.guest && <p className="mt-1 text-sm text-signal">{err.guest}</p>}
        {rows.length < MAX_GUESTS && (
          <button type="button" className="btn btn-ghost mt-3" onClick={() => { setRows([...rows, { key: next, value: "" }]); setNext(next + 1); }}>+ Agregar invitado</button>
        )}
      </fieldset>
    </>
  );
}
