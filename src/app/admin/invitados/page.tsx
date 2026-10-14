import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadCrewGuests } from "@/lib/admin/crew";
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
  const [guests, entries] = await Promise.all([loadCrewGuests(supabase, race.id), loadEntries(supabase, race.id)]);

  const byRunner = new Map<string, typeof guests>();
  for (const g of guests) {
    const k = `${g.bib ?? ""}|${g.runner}`;
    byRunner.set(k, [...(byRunner.get(k) ?? []), g]);
  }
  const submittedBibs = new Set(guests.map((g) => g.bib));
  const pending = entries
    .filter((e) => e.bib && e.public_listing && !submittedBibs.has(e.bib))
    .sort((a, b) => (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true }));

  return (
    <AdminPage>
      <PageHeader
        title="Invitados"
        description={<>{guests.length} invitados de {byRunner.size} corredores · {pending.length} corredores sin enviar lista. Los corredores registran a su crew en <a className="underline" href="/invitados">/invitados</a>.</>}
        actions={guests.length > 0 ? <a className="btn" href="/api/export/invitados">Exportar a Excel (CSV)</a> : undefined}
      />

      {guests.length === 0 ? (
        <EmptyState title="Aún no hay invitados">Comparte el enlace /invitados con los corredores.</EmptyState>
      ) : (
        <div className="overflow-x-auto border-y-2 border-ink">
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-xs uppercase tracking-wider">
              <tr className="border-b border-ink">
                <th className="px-2 py-2">Dorsal</th>
                <th className="px-2 py-2">Corredor</th>
                <th className="px-2 py-2">Invitados</th>
                <th className="px-2 py-2">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {[...byRunner.values()].map((list) => (
                <tr key={`${list[0].bib}|${list[0].runner}`} className="border-b border-ink/20 align-top">
                  <td className="px-2 py-2 font-mono">{list[0].bib}</td>
                  <td className="px-2 py-2">{list[0].runner}</td>
                  <td className="px-2 py-2"><ol className="list-decimal pl-5">{list.map((g) => <li key={g.position}>{g.guest}</li>)}</ol></td>
                  <td className="px-2 py-2 whitespace-nowrap text-ink-2">{formatDateTime(list[0].submitted_at, race.timezone)}</td>
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
