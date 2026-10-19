"use client";

import { useActionState } from "react";
import { type ActionState, initialState } from "@/lib/admin/action-state";
import { actionStateKey } from "@/lib/action-key";
import { PROFILE_FIELDS, profileMaxLength } from "@/lib/runner-profile";
import { Feedback } from "@/components/admin/Feedback";
import { type ProfileFormValues, submitRunnerProfile } from "./actions";

export function ProfileForm() {
  const [state, run, pending] = useActionState(submitRunnerProfile, initialState);
  return (
    <form action={run} className="space-y-6">
      <Fields key={actionStateKey(state)} state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Enviando…" : "Enviar perfil"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function Fields({ state }: { state: ActionState }) {
  const values = (state.ok ? undefined : state.data) as ProfileFormValues | undefined;
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
          <span className="eyebrow">Tu nombre</span>
          <input name="runner_name" defaultValue={values?.runner_name} autoComplete="name" placeholder="Nombre y apellido" className="field mt-1" aria-invalid={Boolean(err.runner_name) || undefined} required />
          {err.runner_name && <span className="mt-1 block text-sm text-signal">{err.runner_name}</span>}
        </label>
      </div>
      {PROFILE_FIELDS.map((f) => (
        <label key={f.name} className="block">
          <span className="eyebrow">{f.label}</span>
          {f.long ? (
            <textarea name={f.name} defaultValue={values?.[f.name]} rows={3} maxLength={profileMaxLength(true)} placeholder={f.placeholder} className="field mt-1" aria-invalid={Boolean(err[f.name]) || undefined} />
          ) : (
            <input name={f.name} defaultValue={values?.[f.name]} maxLength={profileMaxLength(false)} placeholder={f.placeholder} className="field mt-1" aria-invalid={Boolean(err[f.name]) || undefined} />
          )}
          {err[f.name] && <span className="mt-1 block text-sm text-signal">{err[f.name]}</span>}
        </label>
      ))}
    </>
  );
}
