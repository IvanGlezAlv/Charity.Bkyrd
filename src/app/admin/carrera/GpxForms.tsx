"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { removeGpx, uploadGpx } from "../content-actions";

export function GpxForms({ distanceId, current, stats }: { distanceId: string; current: string | null; stats: string | null }) {
  return (
    <div className="border-2 border-ink bg-paper p-4">
      <h3 className="eyebrow mb-2">Archivo GPX</h3>
      {current ? (
        <p className="mb-3 text-sm">Actual: <span className="font-mono">{current}</span>{stats ? ` · ${stats}` : ""}</p>
      ) : (
        <p className="mb-3 text-sm text-ink-2">Sin GPX. Al subirlo se genera el mapa y el perfil de elevación a partir del archivo.</p>
      )}
      <ActionForm action={uploadGpx} submit={current ? "Reemplazar GPX" : "Subir GPX"}>
        <input type="hidden" name="distance_id" value={distanceId} />
        <input type="file" name="file" accept=".gpx,application/gpx+xml" required className="text-sm" />
      </ActionForm>
      {current && (
        <div className="mt-3">
          <ActionForm action={removeGpx} submit="Quitar GPX" confirmText="¿Quitar el GPX de esta distancia?">
            <input type="hidden" name="distance_id" value={distanceId} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
