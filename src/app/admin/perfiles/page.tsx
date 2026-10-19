import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadRunnerProfiles } from "@/lib/admin/runner-profiles";
import { loadEntries } from "@/lib/admin/participants";
import { PROFILE_FIELDS } from "@/lib/runner-profile";
import { formatDateTime } from "@/lib/time";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Perfiles para la transmisión" };

export default async function RunnerProfilesPage() {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const supabase = await createClient();
  const [profiles, entries] = await Promise.all([loadRunnerProfiles(supabase, race.id), loadEntries(supabase, race.id)]);
  const submittedBibs = new Set(profiles.map((p) => p.bib));
  const pending = entries
    .filter((e) => e.bib && e.public_listing && !submittedBibs.has(e.bib))
    .sort((a, b) => (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true }));

  return (
    <AdminPage>
      <PageHeader
        title="Perfiles"
        description={<>{profiles.length} {profiles.length === 1 ? "corredor contó su historia" : "corredores contaron su historia"} · {pending.length} sin enviar. Los corredores lo llenan en <a className="underline" href="/perfil">/perfil</a>.</>}
        actions={profiles.length > 0 ? <a className="btn" href="/api/export/perfiles">Exportar a Excel (CSV)</a> : undefined}
      />

      {profiles.length === 0 ? (
        <EmptyState title="Aún no hay perfiles">Comparte el enlace /perfil con los corredores.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((p) => (
            <article key={`${p.bib}|${p.runner}`} className="border-2 border-ink p-4">
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="display text-3xl"><span className="font-mono text-base">{p.bib}</span> {p.runner}</h2>
                <p className="text-xs text-ink-2">{formatDateTime(p.updated_at, race.timezone)}</p>
              </header>
              <dl className="space-y-2 text-sm">
                {PROFILE_FIELDS.filter((f) => p[f.name]).map((f) => (
                  <div key={f.name}>
                    <dt className="eyebrow text-ink-2">{f.label.replace(/ \(opcional\)$/, "")}</dt>
                    <dd className="whitespace-pre-line">{f.name === "instagram" ? `@${p[f.name]}` : p[f.name]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer eyebrow">Corredores sin perfil ({pending.length})</summary>
          <p className="mt-2 text-sm">{pending.map((e) => `${e.bib} ${e.participant.first_name} ${e.participant.last_name}`.trim()).join(" · ")}</p>
        </details>
      )}
    </AdminPage>
  );
}
