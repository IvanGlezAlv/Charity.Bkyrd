import type { Metadata } from "next";
import Link from "next/link";
import { getActiveRace, getCheckpoints, getDistances, getSchedule, getSections } from "@/lib/data";
import { storageUrl } from "@/lib/env";
import { distanceSummary } from "@/lib/race";
import { formatDate, formatTime } from "@/lib/time";
import { Container } from "@/components/ui/Section";
import { Markdown } from "@/components/ui/Markdown";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Manual del corredor" };

export default async function ManualPage() {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const [sections, schedule, distances, checkpoints] = await Promise.all([
    getSections(race.id, "manual"), getSchedule(race.id), getDistances(race.id), getCheckpoints(race.id),
  ]);
  const visible = sections.filter((s) => s.is_published);
  const courses = distances.filter((d) => d.is_published);
  const pdf = storageUrl(race.manual_pdf_path, { download: `manual-${race.slug}${race.manual_version ? `-v${race.manual_version}` : ""}.pdf` });
  const lastUpdated = race.manual_updated_at ?? visible.map((s) => s.updated_at).sort().at(-1) ?? null;

  const toc = [
    ...visible.map((s) => ({ id: s.slug, label: s.title })),
    ...(schedule.length ? [{ id: "manual-programa", label: "Programa" }] : []),
    ...(courses.length ? [{ id: "manual-recorrido", label: "Recorrido, abastecimientos y cortes" }] : []),
  ];

  return (
    <Container className="pt-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/respect-my-authority.webp" alt="La Charity: Respect my authority" className="mx-auto mb-8 w-full max-w-xs mix-blend-multiply sm:max-w-sm" />
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div>
          <p className="eyebrow">Manual del corredor</p>
          <h1 className="display mt-2 text-6xl sm:text-8xl">Manual.</h1>
          <p className="eyebrow mt-3 text-ink-2">
            {race.manual_version ? `Versión ${race.manual_version}` : "Versión en línea"}
            {lastUpdated && ` · Actualizado ${formatDate(lastUpdated, race.timezone, "long")}`}
          </p>
        </div>
        {pdf && <a href={pdf} className="btn min-h-14 px-6 text-base">Descargar PDF ↓</a>}
      </div>

      {toc.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="Manual en preparación">
            {pdf ? "Mientras tanto, descarga la versión PDF." : "Los organizadores publicarán el manual aquí."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Contenido del manual" className="lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow mb-3">Contenido</p>
            <ol className="space-y-1 border-l-2 border-ink pl-4">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block py-1 hover:underline">
                    <span className="font-mono text-ink-3 tabular">{String(i + 1).padStart(2, "0")} </span>
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article>
            {visible.map((s, i) => (
              <section key={s.id} id={s.slug} className="scroll-mt-24 border-b border-line pb-8 pt-2">
                <h2 className="display mb-4 text-4xl sm:text-5xl">
                  <span className="font-mono text-base text-ink-3 align-top">{String(i + 1).padStart(2, "0")} </span>
                  {s.title}
                </h2>
                <Markdown>{s.body}</Markdown>
              </section>
            ))}

            {schedule.length > 0 && (
              <section id="manual-programa" className="scroll-mt-24 border-b border-line pb-8 pt-2">
                <h2 className="display mb-4 text-4xl sm:text-5xl">Programa</h2>
                <ul className="prose-race">
                  {schedule.map((s) => (
                    <li key={s.id}><strong className="font-mono">{formatTime(s.starts_at, race.timezone)}</strong> · {s.title}{s.description ? `. ${s.description}` : ""}</li>
                  ))}
                </ul>
              </section>
            )}

            {courses.length > 0 && (
              <section id="manual-recorrido" className="scroll-mt-24 pb-8 pt-2">
                <h2 className="display mb-4 text-4xl sm:text-5xl">Recorrido, abastecimientos y cortes</h2>
                {courses.map((d) => {
                  const cps = checkpoints.filter((c) => c.distance_id === d.id);
                  return (
                    <div key={d.id} className="mb-6">
                      <h3 className="text-xl font-bold">{d.name}</h3>
                      <p className="eyebrow text-ink-2">{distanceSummary(race, d)}{d.start_time ? ` · salida ${formatTime(d.start_time, race.timezone)} h` : ""}</p>
                      {d.description && <Markdown className="prose-race mt-2">{d.description}</Markdown>}
                      {cps.length > 0 && (
                        <ul className="prose-race mt-2">
                          {cps.map((c) => (
                            <li key={c.id}>{c.km_mark != null ? `km ${c.km_mark} · ` : ""}{c.name}{c.services ? `: ${c.services}` : ""}{c.cutoff_minutes ? ` (corte ${Math.floor(c.cutoff_minutes / 60)}h${String(c.cutoff_minutes % 60).padStart(2, "0")})` : ""}</li>
                          ))}
                        </ul>
                      )}
                      <Link href={`/recorrido/${d.slug}`} className="mt-2 inline-block underline underline-offset-4">Mapa y GPX de {d.name}</Link>
                    </div>
                  );
                })}
              </section>
            )}
          </article>
        </div>
      )}
    </Container>
  );
}
