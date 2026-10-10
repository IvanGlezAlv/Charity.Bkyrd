"use client";

import { ActionForm } from "@/components/admin/ActionForm";
import type { ResultsPublication } from "@/lib/types";
import { setPublication } from "./actions";

export function PublicationForm({ current, isAdmin }: { current: ResultsPublication; isAdmin: boolean }) {
  if (current === "official") {
    return isAdmin ? (
      <ActionForm action={setPublication} submit="Reabrir como provisionales" danger confirmText="Los resultados dejarán de ser oficiales. ¿Continuar?">
        <input type="hidden" name="publication" value="provisional" />
        <label className="block">
          <span className="label">Motivo (obligatorio, queda en la auditoría)</span>
          <input className="field" name="reason" required minLength={3} maxLength={500} />
        </label>
      </ActionForm>
    ) : <p className="text-sm text-ink-2">Solo un administrador puede reabrir resultados oficiales.</p>;
  }
  return (
    <div className="flex flex-wrap gap-6">
      {current === "hidden" ? (
        <ActionForm action={setPublication} submit="Publicar provisionales">
          <input type="hidden" name="publication" value="provisional" />
        </ActionForm>
      ) : (
        <ActionForm action={setPublication} submit="Ocultar resultados" confirmText="Los resultados dejarán de verse en el sitio. ¿Continuar?">
          <input type="hidden" name="publication" value="hidden" />
        </ActionForm>
      )}
      {isAdmin && (
        <ActionForm action={setPublication} submit="Publicar como oficiales" confirmText="Los resultados quedarán congelados: no se podrán registrar ni corregir tiempos hasta reabrirlos. ¿Publicar como oficiales?">
          <input type="hidden" name="publication" value="official" />
        </ActionForm>
      )}
    </div>
  );
}
