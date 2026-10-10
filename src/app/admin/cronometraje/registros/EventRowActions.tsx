"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { correctEvent, voidEvent } from "../actions";

export function EventRowActions({ eventId, localValue }: { eventId: string; localValue: string }) {
  return (
    <details>
      <summary className="cursor-pointer font-mono text-xs uppercase underline">Corregir</summary>
      <div className="mt-2 grid gap-4 border-l-2 border-ink pl-3 sm:grid-cols-2">
        <ActionForm action={correctEvent} submit="Guardar hora">
          <input type="hidden" name="event_id" value={eventId} />
          <label className="block"><span className="label">Hora correcta</span>
            <input className="field" type="datetime-local" step={1} name="recorded_at" defaultValue={localValue} required /></label>
          <label className="block"><span className="label">Motivo</span>
            <input className="field" name="reason" required minLength={3} maxLength={500} /></label>
        </ActionForm>
        <ActionForm action={voidEvent} submit="Anular registro" danger confirmText="¿Anular este registro? Queda en el historial.">
          <input type="hidden" name="event_id" value={eventId} />
          <label className="block"><span className="label">Motivo</span>
            <input className="field" name="reason" required minLength={3} maxLength={500} /></label>
        </ActionForm>
      </div>
    </details>
  );
}
