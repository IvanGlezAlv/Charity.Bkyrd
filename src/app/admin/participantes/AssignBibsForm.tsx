"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { assignBibs } from "../participantes-actions";

export function AssignBibsForm() {
  return (
    <ActionForm action={assignBibs} submit="Asignar dorsales" className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <label className="block">
        <span className="label">Orden</span>
        <select className="field" name="order" defaultValue="signup">
          <option value="signup">Orden de inscripción</option>
          <option value="alpha">Alfabético por apellido</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Empezar en</span>
        <input className="field" type="number" name="start" min={0} max={99999} defaultValue={1} />
      </label>
      <label className="block">
        <span className="label">Dígitos</span>
        <input className="field" type="number" name="width" min={1} max={6} defaultValue={3} />
        <span className="mt-1 block text-xs text-ink-2">3 dígitos: 001, 002, …</span>
      </label>
    </ActionForm>
  );
}
