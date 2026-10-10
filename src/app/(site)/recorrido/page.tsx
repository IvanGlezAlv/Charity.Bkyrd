import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveRace, getDistances } from "@/lib/data";
import { storageUrl } from "@/lib/env";
import { distanceSummary } from "@/lib/race";
import { formatTime } from "@/lib/time";
import { Container } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Recorrido" };

export default async function CoursesPage() {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const distances = (await getDistances(race.id)).filter((d) => d.is_published);
  // With a single course (the Backyard loop) there is nothing to choose: go straight to its map.
  if (distances.length === 1) redirect(`/recorrido/${distances[0].slug}`);
  return (
    <Container className="pt-10">
      <p className="eyebrow">Recorrido</p>
      <h1 className="display mt-2 text-6xl sm:text-8xl">{race.format === "backyard" ? "El loop." : "Distancias."}</h1>
      {distances.length === 0 ? (
        <div className="mt-10"><EmptyState title="Recorrido por publicar">Los organizadores publicarán aquí el recorrido y el GPX.</EmptyState></div>
      ) : (
        <ul className="mt-10 divide-y-2 divide-ink border-y-2 border-ink">
          {distances.map((d) => (
            <li key={d.id} className="grid gap-4 py-6 md:grid-cols-[1fr_auto] md:items-center">
              <Link href={`/recorrido/${d.slug}`} className="group">
                <span className="display block text-5xl group-hover:underline">{d.name}</span>
                <span className="eyebrow mt-1 block text-ink-2">{distanceSummary(race, d)}{d.start_time ? ` · salida ${formatTime(d.start_time, race.timezone)} h` : ""}</span>
              </Link>
              <div className="flex flex-wrap gap-2">
                <Link href={`/recorrido/${d.slug}`} className="btn btn-ghost">Ver mapa</Link>
                {d.gpx_path && <a className="btn" download href={storageUrl(d.gpx_path, { download: d.gpx_filename ?? `${d.slug}.gpx` })!}>Descargar GPX</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
