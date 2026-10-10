"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { initialState, type ActionState } from "@/lib/admin/action-state";
import { Feedback } from "@/components/admin/Feedback";
import type { AdminEntry } from "@/lib/types";
import { saveParticipant } from "../participantes-actions";

interface Option { id: string; name: string }

export function ParticipantForm({ entry, distances, categories }: { entry?: AdminEntry; distances: Option[]; categories: Option[] }) {
  const [state, run, pending] = useActionState<ActionState, FormData>(saveParticipant, initialState);
  const router = useRouter();
  const p = entry?.participant;
  useEffect(() => {
    if (state.ok && !entry) router.push("/admin/participantes");
  }, [state, entry, router]);

  const text = (name: string, label: string, value: string | number | null | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" name={name} defaultValue={value ?? ""} aria-invalid={Boolean(state.errors?.[name])} {...props} />
      {state.errors?.[name] && <span className="mt-1 block text-xs text-signal">{state.errors[name]}</span>}
    </label>
  );

  return (
    <form action={run} className="space-y-8">
      {entry && <input type="hidden" name="registration_id" value={entry.id} />}
      {p && <input type="hidden" name="participant_id" value={p.id} />}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Corredor</legend>
        {text("first_name", "Nombre(s)", p?.first_name, { required: true })}
        {text("last_name", "Apellidos", p?.last_name)}
        <label className="block">
          <span className="label">Sexo</span>
          <select className="field" name="gender" defaultValue={p?.gender ?? ""}>
            <option value="">Sin dato</option>
            <option value="F">Femenil</option>
            <option value="M">Varonil</option>
            <option value="X">No binario / otro</option>
          </select>
        </label>
        {text("age", "Edad", p?.age, { type: "number", min: 0, max: 120 })}
        {text("birth_date", "Fecha de nacimiento", p?.birth_date, { type: "date" })}
        {text("shirt_size", "Talla de playera", p?.shirt_size, { maxLength: 10 })}
        {text("club", "Club / equipo", p?.club)}
        {text("city", "Ciudad", p?.city)}
        {text("nationality", "Nacionalidad", p?.nationality)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Inscripción</legend>
        {text("bib", "Dorsal", entry?.bib, { pattern: "[A-Za-z0-9-]{1,12}", inputMode: "numeric" })}
        <label className="block">
          <span className="label">Distancia</span>
          <select className="field" name="distance_id" defaultValue={entry?.distance_id ?? distances[0]?.id} required>
            {distances.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {state.errors?.distance_id && <span className="mt-1 block text-xs text-signal">{state.errors.distance_id}</span>}
        </label>
        {categories.length > 0 && (
          <label className="block">
            <span className="label">Categoría</span>
            <select className="field" name="category_id" defaultValue={entry?.category_id ?? ""}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="public_listing" defaultChecked={entry?.public_listing ?? true} />
          <span>Aparece en la lista pública y resultados</span>
        </label>
        {text("external_ref", "Referencia externa", p?.external_ref)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Contacto (privado)</legend>
        {text("email", "Correo", p?.email, { type: "email" })}
        {text("phone", "Teléfono", p?.phone, { type: "tel" })}
        {text("emergency_contact_name", "Contacto de emergencia", p?.emergency_contact_name)}
        {text("emergency_contact_phone", "Teléfono de emergencia", p?.emergency_contact_phone, { type: "tel" })}
        <label className="block sm:col-span-2">
          <span className="label">Condiciones médicas</span>
          <textarea className="field min-h-20" name="medical_notes" defaultValue={p?.medical_notes ?? ""} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Notas internas</span>
          <textarea className="field min-h-20" name="internal_notes" defaultValue={p?.internal_notes ?? ""} />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Guardando…" : entry ? "Guardar cambios" : "Agregar corredor"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
