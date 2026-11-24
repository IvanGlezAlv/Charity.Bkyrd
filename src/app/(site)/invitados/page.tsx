import type { Metadata } from "next";
import Link from "next/link";
import { getActiveRace } from "@/lib/data";
import { Container } from "@/components/ui/Section";
import { CrewForm } from "./CrewForm";

export const metadata: Metadata = { title: "Registro de invitados" };

export default async function InvitadosPage() {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  return (
    <Container className="max-w-2xl pt-10 pb-16">
      <p className="eyebrow">Crew e invitados</p>
      <h1 className="display mt-2 text-6xl sm:text-7xl">Registra a tu crew.</h1>
      <p className="mt-4 text-lg">
        Para entrar a Las Riberas el día de la carrera, cada persona debe estar en la lista de acceso de la caseta. Escribe el nombre completo de
        cada persona que va a entrar y cuántos autos llevarán.
      </p>
      <p className="mt-2 text-sm text-ink-2">
        Corredores: usen el dorsal que les entregamos y su nombre; si no coincide con la página de <Link href="/corredores" className="underline">Corredores</Link>, envíenlo igual.
        Si no vas a correr, elige «No soy corredor». Puedes enviar varias listas; todas se suman y ninguna borra a la anterior.
      </p>
      <div className="mt-8 border-t-2 border-ink pt-8">
        <CrewForm />
      </div>
    </Container>
  );
}
