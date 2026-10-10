import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getCategories, getDistances } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadEntry } from "@/lib/admin/participants";
import { PARTICIPATION_LABEL } from "@/lib/labels";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { ParticipantForm } from "../ParticipantForm";
import { DeleteEntryForm, StatusForm } from "../EntryActions";

export const metadata = { title: "Editar corredor" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditParticipantPage({ params }: PageProps<"/admin/participantes/[id]">) {
  await requirePageRole("organizer");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const race = (await getActiveRace())!;
  const supabase = await createClient();
  const [entry, distances, categories] = await Promise.all([
    loadEntry(supabase, race.id, id),
    getDistances(race.id),
    getCategories(race.id),
  ]);
  if (!entry) notFound();
  const p = entry.participant;
  return (
    <AdminPage>
      <p className="mb-4"><Link className="font-mono text-xs uppercase tracking-widest underline" href="/admin/participantes">← Corredores</Link></p>
      <PageHeader
        title={`${entry.bib ? `#${entry.bib} ` : ""}${p.first_name} ${p.last_name}`}
        description={<>Estado: <strong>{PARTICIPATION_LABEL[entry.status]}</strong>{entry.status_reason && ` · ${entry.status_reason}`}</>}
      />
      <div className="grid gap-12 lg:grid-cols-[1fr_18rem]">
        <ParticipantForm entry={entry} distances={distances} categories={categories} />
        <aside className="space-y-10">
          <section>
            <h2 className="eyebrow mb-3">Estado en carrera</h2>
            <StatusForm registrationId={entry.id} status={entry.status} />
          </section>
          <section>
            <h2 className="eyebrow mb-3">Eliminar</h2>
            <p className="mb-3 text-sm text-ink-2">Solo para inscripciones por error. Si ya tiene tiempos, márcalo como DNS o DNF.</p>
            <DeleteEntryForm participantId={p.id} />
          </section>
        </aside>
      </div>
    </AdminPage>
  );
}
