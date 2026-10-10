import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getDistances } from "@/lib/data";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { ImportParticipants } from "./ImportParticipants";

export const metadata = { title: "Importar corredores" };

export default async function ImportParticipantsPage() {
  await requirePageRole("organizer");
  const race = (await getActiveRace())!;
  const distances = await getDistances(race.id);
  return (
    <AdminPage wide>
      <p className="mb-4"><Link className="font-mono text-xs uppercase tracking-widest underline" href="/admin/participantes">← Corredores</Link></p>
      <PageHeader
        title="Importar corredores"
        description="Revisa la vista previa antes de importar. Nada se guarda hasta que confirmes, y el servidor vuelve a validar el archivo."
      />
      {distances.length === 0 ? (
        <p>Primero crea una distancia en <Link className="underline" href="/admin/carrera">Carrera y distancias</Link>.</p>
      ) : (
        <ImportParticipants />
      )}
    </AdminPage>
  );
}
