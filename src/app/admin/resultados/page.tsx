import Link from "next/link";
import { requirePageRole, roleAllows } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PARTICIPATION_LABEL, PUBLICATION_LABEL, flagLabel } from "@/lib/labels";
import { formatElapsed, formatDateTime } from "@/lib/time";
import type { ParticipationStatus } from "@/lib/types";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { PublicationForm } from "./PublicationForm";

export const metadata = { title: "Resultados" };

interface Row {
  registration_id: string;
  status: ParticipationStatus;
  laps_completed: number;
  ranking_elapsed_s: number | null;
  overall_rank: number | null;
  flags: string[];
}

export default async function ResultsAdminPage() {
  const session = await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const supabase = await createClient();
  const [{ data: results }, { data: roster }] = await Promise.all([
    supabase.from("race_results").select("registration_id,status,laps_completed,ranking_elapsed_s,overall_rank,flags").eq("race_id", race.id).order("overall_rank", { nullsFirst: false }),
    supabase.from("staff_roster").select("registration_id,bib,first_name,last_name").eq("race_id", race.id),
  ]);
  const names = new Map((roster ?? []).map((r) => [r.registration_id as string, r]));
  const rows = (results ?? []) as Row[];
  const flagged = rows.filter((r) => r.flags.length > 0);
  const backyard = race.format === "backyard";

  return (
    <AdminPage wide>
      <PageHeader
        title="Resultados"
        description={<>Estado: <strong>{PUBLICATION_LABEL[race.results_publication]}</strong>{race.results_published_at && ` · oficiales desde ${formatDateTime(race.results_published_at, race.timezone)}`}. Se recalculan solos con cada registro. <Link className="underline" href="/resultados">Ver página pública</Link></>}
      />
      <section className="mb-10 border-2 border-ink p-4">
        <h2 className="eyebrow mb-3">Publicación</h2>
        <PublicationForm current={race.results_publication} isAdmin={roleAllows(session.roles, "admin")} />
      </section>

      <h2 className="eyebrow mb-2">Revisar antes de publicar ({flagged.length})</h2>
      {flagged.length === 0 ? <p className="mb-10 text-ink-2">Sin alertas.</p> : (
        <ul className="mb-10 divide-y divide-line border-y-2 border-ink text-sm">
          {flagged.map((r) => {
            const n = names.get(r.registration_id);
            return (
              <li key={r.registration_id} className="flex flex-wrap gap-3 py-2">
                <span className="font-mono font-bold">{n?.bib ?? "—"}</span>
                <span>{n?.first_name} {n?.last_name}</span>
                <span className="text-signal">{r.flags.map(flagLabel).join(" · ")}</span>
                <Link className="ml-auto underline" href={`/admin/cronometraje/registros?corredor=${r.registration_id}`}>Revisar registros</Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="eyebrow mb-2">Clasificación actual</h2>
      <div className="overflow-x-auto border-y-2 border-ink">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-xs uppercase tracking-wider">
            <tr className="border-b border-ink">
              <th className="px-2 py-2">Lugar</th><th className="px-2 py-2">Dorsal</th><th className="px-2 py-2">Corredor</th>
              <th className="px-2 py-2">{backyard ? "Vueltas" : "Tiempo"}</th><th className="px-2 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const n = names.get(r.registration_id);
              return (
                <tr key={r.registration_id}>
                  <td className="px-2 py-2 font-mono">{r.overall_rank ?? "—"}</td>
                  <td className="px-2 py-2 font-mono font-bold">{n?.bib ?? "—"}</td>
                  <td className="px-2 py-2">{n?.first_name} {n?.last_name}</td>
                  <td className="px-2 py-2 font-mono">{backyard ? r.laps_completed : r.ranking_elapsed_s !== null ? formatElapsed(r.ranking_elapsed_s * 1000) : "—"}</td>
                  <td className="px-2 py-2">{PARTICIPATION_LABEL[r.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
