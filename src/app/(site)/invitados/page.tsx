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
        Para entrar a {race.venue_name ?? "la sede"} cada invitado necesita un código QR. Escribe tu dorsal, tu nombre y el nombre completo de
        cada persona que te acompañará. La organización generará los códigos con esta lista.
      </p>
      <p className="mt-2 text-sm text-ink-2">
        ¿No sabes tu dorsal? Búscalo en <Link href="/corredores" className="underline">Corredores</Link>. Puedes volver a enviar el formulario
        para corregir la lista; la nueva reemplaza a la anterior.
      </p>
      <div className="mt-8 border-t-2 border-ink pt-8">
        <CrewForm />
      </div>
    </Container>
  );
}
