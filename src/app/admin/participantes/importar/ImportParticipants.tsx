"use client";

import { useActionState, useRef, startTransition } from "react";
import { initialState, type ActionState } from "@/lib/admin/action-state";
import { Feedback } from "@/components/admin/Feedback";
import type { ParticipantPreview } from "@/lib/import/participants";
import { commitParticipantImport, previewParticipantImport } from "../../participantes-actions";

const MATCH_LABEL = { external_ref: "referencia", bib: "dorsal", name_birth_date: "nombre y nacimiento", name_email: "nombre y correo" } as const;

export function ImportParticipants() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, runPreview, previewing] = useActionState<ActionState, FormData>(previewParticipantImport, initialState);
  const [commit, runCommit, committing] = useActionState<ActionState, FormData>(commitParticipantImport, initialState);
  const data = preview.ok ? (preview.data as ParticipantPreview) : null;
  const importable = data ? data.rows.length - data.summary.errors : 0;

  // Handled manually so the file input is not reset between preview and import.
  const submit = (kind: "preview" | "commit") => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    if (kind === "commit" && !confirm(`¿Importar ${importable} corredores?`)) return;
    const fd = new FormData(form);
    startTransition(() => (kind === "preview" ? runPreview(fd) : runCommit(fd)));
  };

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit("preview"); }} className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-2">
        <label className="block">
          <span className="label">Archivo CSV o Excel (.xlsx)</span>
          <input className="field" type="file" name="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          <span className="mt-1 block text-xs text-ink-2">Primera fila con encabezados. Máximo 5 MB.</span>
        </label>
        <label className="block">
          <span className="label">…o pega la tabla desde una hoja de cálculo</span>
          <textarea className="field min-h-28 font-mono text-xs" name="pasted" placeholder={"Nombre completo\tEdad\tCorreo\tTalla\tTeléfono\t…"} />
        </label>
      </section>
      <p className="text-sm text-ink-2">
        Columnas reconocidas: nombre completo (o nombre y apellidos), dorsal, distancia, categoría, sexo, edad, fecha de nacimiento,
        talla, correo, teléfono, contacto y teléfono de emergencia, condiciones médicas, club, ciudad, referencia. El orden de las filas
        se guarda como orden de inscripción.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={previewing}>{previewing ? "Revisando…" : "Revisar datos"}</button>
        {!preview.ok && <Feedback state={preview} />}
      </div>

      {data && (
        <section className="space-y-6">
          <div className="grid grid-cols-2 gap-px border-2 border-ink bg-ink sm:grid-cols-5">
            {[
              ["Filas", data.summary.total],
              ["Nuevos", data.summary.new],
              ["Ya existen", data.summary.matched],
              ["Con errores", data.summary.errors],
              ["Con avisos", data.summary.warnings],
            ].map(([label, n]) => (
              <div key={label} className="bg-paper p-3">
                <p className="eyebrow">{label}</p>
                <p className="display text-4xl">{n}</p>
              </div>
            ))}
          </div>
          {data.missingColumns.length > 0 && (
            <p className="border-l-4 border-signal bg-signal/10 px-3 py-2 text-signal">Faltan columnas obligatorias: {data.missingColumns.join(", ")}.</p>
          )}
          {data.unknownColumns.length > 0 && (
            <p className="text-sm text-ink-2">Columnas ignoradas: {data.unknownColumns.join(", ")}.</p>
          )}

          <div className="max-h-[32rem] overflow-auto border-y-2 border-ink">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-paper font-mono text-xs uppercase tracking-wider">
                <tr className="border-b border-ink">
                  <th className="px-2 py-2">Fila</th>
                  <th className="px-2 py-2">Corredor</th>
                  <th className="px-2 py-2">Dorsal</th>
                  <th className="px-2 py-2">Edad</th>
                  <th className="px-2 py-2">Talla</th>
                  <th className="px-2 py-2">Coincide con</th>
                  <th className="px-2 py-2">Revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => {
                  const hasError = r.issues.some((i) => i.level === "error");
                  return (
                    <tr key={r.line} className={hasError ? "bg-signal/10" : undefined}>
                      <td className="px-2 py-2 font-mono text-ink-2">{r.line}</td>
                      <td className="px-2 py-2 font-bold">{r.data.first_name} {r.data.last_name}</td>
                      <td className="px-2 py-2 font-mono">{r.data.bib || "—"}</td>
                      <td className="px-2 py-2">{r.data.age || "—"}</td>
                      <td className="px-2 py-2">{r.data.shirt_size || "—"}</td>
                      <td className="px-2 py-2 text-xs">{r.match ? `${r.match.name} (por ${MATCH_LABEL[r.match.by]})` : "Nuevo"}</td>
                      <td className="px-2 py-2 text-xs">
                        {r.issues.length === 0 ? <span className="text-ok">OK</span> : (
                          <ul className="space-y-0.5">
                            {r.issues.map((i, k) => (
                              <li key={k} className={i.level === "error" ? "font-bold text-signal" : "text-ink-2"}>
                                {i.level === "error" ? "Error: " : "Aviso: "}{i.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.missingColumns.length === 0 && importable > 0 && (
            <fieldset className="space-y-3 border-2 border-ink p-4">
              <legend className="eyebrow px-1">Importar</legend>
              <p className="text-sm">
                Se importarán {importable} {importable === 1 ? "fila" : "filas"}.{data.summary.errors > 0 && (data.summary.errors === 1 ? " La fila con errores no se importará." : ` Las ${data.summary.errors} filas con errores no se importarán.`)} Los avisos
                no bloquean: el dato inválido se deja vacío para corregirlo después.
              </p>
              <label className="flex items-start gap-2">
                <input type="radio" name="strategy" value="create_only" defaultChecked required />
                <span><strong>Solo agregar nuevos.</strong> Los corredores que ya existen no se tocan.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="strategy" value="update_existing" />
                <span><strong>Agregar y actualizar.</strong> Los que ya existen se sobrescriben con los datos del archivo.</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn" disabled={committing} onClick={() => submit("commit")}>
                  {committing ? "Importando…" : `Importar ${importable} corredores`}
                </button>
                <Feedback state={commit} />
              </div>
            </fieldset>
          )}
        </section>
      )}
    </form>
  );
}
