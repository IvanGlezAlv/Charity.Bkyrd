import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { CollectionEditor } from "@/components/admin/CollectionEditor";
import type { GpxStats } from "@/lib/types";
import { RaceSettingsForm } from "./RaceSettingsForm";
import { GpxForms } from "./GpxForms";

export const metadata = { title: "Carrera y distancias" };

export default async function RaceConfigPage() {
  await requirePageRole("organizer");
  const race = (await getActiveRace())!;
  return (
    <AdminPage>
      <PageHeader
        title="Carrera y distancias"
        description="Datos generales, distancias con sus GPX, categorías, ubicaciones y puntos de control. Los resultados oficiales se publican desde Resultados."
      />
      <section className="mb-12">
        <h2 className="display mb-4 text-4xl">Configuración general</h2>
        <RaceSettingsForm race={race} />
      </section>
      <CollectionEditor
        collectionKey="distances"
        race={race}
        extra={(row) => {
          const stats = row.gpx_stats as GpxStats | null;
          return (
            <GpxForms
              distanceId={row.id as string}
              current={(row.gpx_filename as string | null) ?? null}
              stats={stats ? `${stats.distance_km} km medidos, ${stats.points} puntos${stats.has_elevation ? `, +${stats.gain_m}/−${stats.loss_m} m` : ", sin elevación"}` : null}
            />
          );
        }}
      />
      <CollectionEditor collectionKey="locations" race={race} />
      <CollectionEditor collectionKey="checkpoints" race={race} />
      <CollectionEditor collectionKey="categories" race={race} />
    </AdminPage>
  );
}
