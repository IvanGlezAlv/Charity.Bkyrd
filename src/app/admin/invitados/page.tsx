import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadCrewSubmissions } from "@/lib/admin/crew";
import { loadEntries } from "@/lib/admin/participants";
import { formatDateTime } from "@/lib/time";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Invitados" };

export default async function CrewGuestsPage() {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const supabase = await createClient();
  const [submissions, entries] = await Promise.all([loadCrewSubmissions(supabase, race.id), loadEntries(supabase, race.id)]);

  const guestCount = submissions.reduce((n, s) => n + s.guests.length, 0);
  const uniqueCount = submissions.reduce((n, s) => n + s.guests.filter((g) => !g.repeated).length, 0);
  const totalCars = submissions.reduce((n, s) => n + (s.cars ?? 0), 0);
  const runnerIds = new Set(submissions.filter((s) => !s.former_runner).map((s) => s.registration_id).filter(Boolean));
  const nonRunners = submissions.filter((s) => !s.is_runner).length;
  const mismatches = submissions.filter((s) => s.bib_mismatch).length;
  const former = submissions.filter((s) => s.former_runner).length;
  const pending = entries
    .filter((e) => e.bib && e.public_listing && !runnerIds.has(e.id))
    .sort((a, b) => (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true }));
  // Newest first on screen; the export keeps submission order.
  const list = [...submissions].reverse();

  return (
    <AdminPage>
      <PageHeader
        title="Invitados"
        description={<>
          {uniqueCount} personas distintas ({guestCount} nombres enviados) y {totalCars} autos en {submissions.length} envíos: {runnerIds.size} corredores identificados, {mismatches} envíos de corredor con dorsal que no coincide, {former} de corredores que ya no corren y {nonRunners} de no corredores · {pending.length} corredores sin enviar lista.
          Se registran en <a className="underline" href="/invitados">/invitados</a>; cada envío se suma, ninguno borra al anterior.
        </>}
        actions={guestCount > 0 ? <a className="btn" href="/api/export/invitados">Exportar a Excel (CSV)</a> : undefined}
      />

      {submissions.length === 0 ? (
        <EmptyState title="Aún no hay invitados">Comparte el enlace /invitados con los corredores y su gente.</EmptyState>
      ) : (
        <div className="overflow-x-auto border-y-2 border-ink">
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-xs uppercase tracking-wider">
              <tr className="border-b border-ink">
                <th className="px-2 py-2">Envía</th>
                <th className="px-2 py-2">Invitados</th>
                <th className="px-2 py-2">Autos</th>
                <th className="px-2 py-2">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-ink/20 align-top">
                  <td className="px-2 py-2">
                    {s.is_runner
                      ? <>
                          <span className="font-mono">#{s.registered?.bib ?? s.bib}</span> {s.submitter}
                          {s.former_runner
                            ? <span className="block text-xs font-semibold text-signal">Ya no corre{s.bib ? ` · envió con el dorsal ${s.bib}` : ""}</span>
                            : s.bib_mismatch
                              ? <span className="block text-xs font-semibold text-signal">Corredor · el dorsal {s.bib} no coincide con la lista</span>
                              : <span className="block text-xs text-ink-2">Corredor{s.registered && s.registered.name !== s.submitter ? ` · en la lista: ${s.registered.name}` : ""}{s.registered?.bib && s.bib && s.registered.bib !== s.bib ? ` · escribió ${s.bib}` : ""}</span>}
                        </>
                      : <>{s.submitter}<span className="block text-xs text-ink-2">No corredor{s.with_runner ? ` · apoya a ${s.with_runner}` : ""}</span></>}
                  </td>
                  <td className="px-2 py-2">
                    <ol className="list-decimal pl-5">
                      {s.guests.map((g) => <li key={g.position} className={g.repeated ? "text-ink-3" : undefined}>{g.name}{g.repeated && <span className="ml-1 text-xs">(repetido)</span>}</li>)}
                    </ol>
                  </td>
                  <td className="px-2 py-2">
                    {s.cars ?? "—"}
                    {s.plates && <span className="block text-xs text-ink-2">{s.plates}</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-ink-2">{formatDateTime(s.submitted_at, race.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer eyebrow">Corredores sin lista ({pending.length})</summary>
          <p className="mt-2 text-sm">{pending.map((e) => `${e.bib} ${e.participant.first_name} ${e.participant.last_name}`.trim()).join(" · ")}</p>
        </details>
      )}
    </AdminPage>
  );
}
