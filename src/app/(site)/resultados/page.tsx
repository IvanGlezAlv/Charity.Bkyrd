import type { Metadata } from "next";
import { getActiveRace, getCategories, getDistances } from "@/lib/data";
import { getPublicResults } from "@/lib/results";
import { Container } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResultsBoard } from "@/components/results/ResultsBoard";

export const metadata: Metadata = { title: "Resultados" };

export default async function ResultsPage() {
  const race = (await getActiveRace())!;
  const [distances, categories] = await Promise.all([getDistances(race.id), getCategories(race.id)]);

  return (
    <Container className="pt-10">
      <p className="eyebrow">Resultados</p>
      <h1 className="display mt-2 mb-8 text-6xl sm:text-8xl">{race.format === "backyard" ? "Last one standing." : "Clasificación."}</h1>
      {race.results_publication === "hidden" ? (
        <EmptyState title="Resultados aún no disponibles" image="/brand/ep05-la-resistencia.webp">
          Los resultados en vivo se publicarán aquí el día de la carrera.
        </EmptyState>
      ) : (
        <ResultsLoader raceId={race.id} race={race} distances={distances.filter((d) => d.is_published)} categories={categories} />
      )}
    </Container>
  );
}

async function ResultsLoader({ raceId, race, distances, categories }: {
  raceId: string;
  race: NonNullable<Awaited<ReturnType<typeof getActiveRace>>>;
  distances: Awaited<ReturnType<typeof getDistances>>;
  categories: Awaited<ReturnType<typeof getCategories>>;
}) {
  const { rows, error } = await getPublicResults(raceId);
  if (error) {
    return <p role="alert" className="border-2 border-signal p-4 text-signal">No se pudieron cargar los resultados. Intenta de nuevo en un momento.</p>;
  }
  return (
    <ResultsBoard
      raceId={raceId}
      format={race.format}
      timezone={race.timezone}
      publication={race.results_publication}
      distances={distances.map((d) => ({ id: d.id, name: d.name, distance_km: d.distance_km }))}
      categories={categories}
      initialRows={rows}
      initialFetchedAt={new Date().toISOString()}
    />
  );
}
