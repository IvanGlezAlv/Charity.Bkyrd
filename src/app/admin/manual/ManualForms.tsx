"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import { updateManualVersion, uploadManualPdf } from "../content-actions";

export function ManualForms({ version }: { version: string | null }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border-2 border-ink p-4">
        <h3 className="eyebrow mb-3">Subir nueva versión en PDF</h3>
        <ActionForm action={uploadManualPdf} submit="Publicar PDF">
          <div>
            <label className="label" htmlFor="pdf-version">Versión</label>
            <input id="pdf-version" name="version" className="field" required placeholder="Ej. 1.1" />
          </div>
          <input type="file" name="file" accept="application/pdf" required className="text-sm" />
        </ActionForm>
      </div>
      <div className="border-2 border-ink p-4">
        <h3 className="eyebrow mb-3">Solo actualicé el texto en línea</h3>
        <ActionForm action={updateManualVersion} submit="Marcar versión">
          <div>
            <label className="label" htmlFor="text-version">Versión</label>
            <input id="text-version" name="version" className="field" required defaultValue={version ?? ""} />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
