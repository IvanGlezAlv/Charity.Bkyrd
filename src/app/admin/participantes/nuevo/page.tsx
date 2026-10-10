import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getCategories, getDistances } from "@/lib/data";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { ParticipantForm } from "../ParticipantForm";

export const metadata = { title: "Agregar corredor" };

export default async function NewParticipantPage() {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const [distances, categories] = await Promise.all([getDistances(race.id), getCategories(race.id)]);
  return (
    <AdminPage>
      <p className="mb-4"><Link className="font-mono text-xs uppercase tracking-widest underline" href="/admin/participantes">← Corredores</Link></p>
      <PageHeader title="Agregar corredor" />
      {distances.length === 0 ? (
        <p>Primero crea una distancia en <Link className="underline" href="/admin/carrera">Carrera y distancias</Link>.</p>
      ) : (
        <ParticipantForm distances={distances} categories={categories} />
      )}
    </AdminPage>
  );
}
