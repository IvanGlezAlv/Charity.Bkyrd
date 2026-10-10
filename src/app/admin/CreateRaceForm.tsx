"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { createRace } from "./content-actions";

export function CreateRaceForm() {
  return (
    <ActionForm action={createRace} submit="Crear carrera" className="mt-6 space-y-3">
      <div>
        <label className="label" htmlFor="race-name">Nombre</label>
        <input id="race-name" name="name" className="field" required defaultValue="La Charity Bkyrd Ultra Vol. II" />
      </div>
      <div>
        <label className="label" htmlFor="race-slug">Identificador</label>
        <input id="race-slug" name="slug" className="field" required defaultValue="la-charity-bkyrd-ultra-vol-ii" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </div>
      <div>
        <label className="label" htmlFor="race-tz">Zona horaria</label>
        <input id="race-tz" name="timezone" className="field" required defaultValue="America/Hermosillo" />
      </div>
    </ActionForm>
  );
}
