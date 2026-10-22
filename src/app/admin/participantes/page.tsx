import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getDistances } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { entryGaps, filterEntries, loadEntries } from "@/lib/admin/participants";
import { PARTICIPATION_LABEL } from "@/lib/labels";
import { compareBibs } from "@/lib/timing/console";
import type { ParticipationStatus } from "@/lib/types";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssignBibsForm } from "./AssignBibsForm";

export const metadata = { title: "Corredores" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ParticipantsPage({ searchParams }: PageProps<"/admin/participantes">) {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const sp = await searchParams;
  const filter = { q: one(sp.q), status: one(sp.estado), distance: one(sp.distancia), missing: one(sp.faltante) };
  const supabase = await createClient();
  const [entries, distances] = await Promise.all([loadEntries(supabase, race.id), getDistances(race.id)]);
  const shown = filterEntries(entries, filter).sort((a, b) => compareBibs(a.bib, b.bib) || entries.indexOf(a) - entries.indexOf(b));
  const distanceName = new Map(distances.map((d) => [d.id, d.name]));
  const withoutBib = entries.filter((e) => !e.bib).length;
  const sizes = entries.reduce<Record<string, number>>((acc, e) => {
    const s = e.participant.shirt_size || "Sin talla";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
  const sizeList = Object.entries(sizes).sort(([a], [b]) => (sizeOrder.indexOf(a) + 1 || 99) - (sizeOrder.indexOf(b) + 1 || 99));

  return (
    <AdminPage wide>
      <PageHeader
        title="Corredores"
        description={<>{entries.length} inscritos · {withoutBib} sin dorsal · Tallas: {sizeList.map(([s, n]) => `${s} ${n}`).join(" · ") || "—"}</>}
        actions={
          <>
            <Link className="btn btn-ghost" href="/admin/participantes/importar">Importar</Link>
            <a className="btn btn-ghost" href="/api/export/participantes">Exportar CSV</a>
            <Link className="btn" href="/admin/participantes/nuevo">Agregar corredor</Link>
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState title="Aún no hay corredores">
          <Link className="underline" href="/admin/participantes/importar">Importa tu lista</Link> desde CSV o Excel, o agrégalos uno por uno.
        </EmptyState>
      ) : (
        <>
          <section className="mb-8 border-2 border-ink p-4">
            <h2 className="eyebrow mb-3">{withoutBib > 0 ? `Asignar dorsales a ${withoutBib} corredores sin número` : "Todos los corredores tienen dorsal"}</h2>
            <AssignBibsForm />
          </section>

          <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
            <input className="field" type="search" name="q" defaultValue={filter.q} placeholder="Buscar por nombre, dorsal, correo, teléfono…" aria-label="Buscar" />
            <select className="field" name="estado" defaultValue={filter.status} aria-label="Estado">
              <option value="">Todos los estados</option>
              {(Object.keys(PARTICIPATION_LABEL) as ParticipationStatus[]).map((s) => <option key={s} value={s}>{PARTICIPATION_LABEL[s]}</option>)}
            </select>
            {distances.length > 1 && (
              <select className="field" name="distancia" defaultValue={filter.distance} aria-label="Distancia">
                <option value="">Todas las distancias</option>
                {distances.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <select className="field" name="faltante" defaultValue={filter.missing} aria-label="Datos faltantes">
              <option value="">Con o sin datos faltantes</option>
              <option value="bib">Sin dorsal</option>
              <option value="any">Con datos faltantes</option>
            </select>
            <button className="btn">Filtrar</button>
          </form>
          <p className="mb-2 text-sm text-ink-2">Mostrando {shown.length} de {entries.length}, por número de dorsal. La columna # es el orden de inscripción.</p>

          <div className="overflow-x-auto border-y-2 border-ink">
            <table className="w-full text-left text-sm">
              <thead className="font-mono text-xs uppercase tracking-wider">
                <tr className="border-b border-ink">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Dorsal</th>
                  <th className="px-2 py-2">Nombre</th>
                  {distances.length > 1 && <th className="px-2 py-2">Distancia</th>}
                  <th className="px-2 py-2">Edad</th>
                  <th className="px-2 py-2">Talla</th>
                  <th className="px-2 py-2">Teléfono</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2">Pendientes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((e) => {
                  const p = e.participant;
                  const gaps = entryGaps(e);
                  return (
                    <tr key={e.id} className="hover:bg-ink/5">
                      <td className="px-2 py-2 font-mono text-ink-2">{entries.indexOf(e) + 1}</td>
                      <td className="px-2 py-2 font-mono font-bold">{e.bib ?? "—"}</td>
                      <td className="px-2 py-2">
                        <Link className="font-bold underline-offset-2 hover:underline" href={`/admin/participantes/${e.id}`}>
                          {p.first_name} {p.last_name}
                        </Link>
                        {p.medical_notes && <span className="ml-2 font-mono text-xs text-signal" title={p.medical_notes}>MÉDICO</span>}
                        {p.email && <div className="text-xs text-ink-2">{p.email}</div>}
                      </td>
                      {distances.length > 1 && <td className="px-2 py-2">{distanceName.get(e.distance_id)}</td>}
                      <td className="px-2 py-2">{p.age ?? "—"}</td>
                      <td className="px-2 py-2">{p.shirt_size ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2">{p.phone ?? "—"}</td>
                      <td className="px-2 py-2">{PARTICIPATION_LABEL[e.status]}</td>
                      <td className="px-2 py-2 text-xs text-ink-2">{gaps.join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminPage>
  );
}
