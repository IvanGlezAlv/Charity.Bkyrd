import type { Metadata } from "next";
import Link from "next/link";
import { getActiveRace } from "@/lib/data";
import { Container } from "@/components/ui/Section";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Tu perfil de corredor" };

export default async function PerfilPage() {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  return (
    <Container className="max-w-2xl pt-10 pb-16">
      <p className="eyebrow">Transmisión en vivo</p>
      <h1 className="display mt-2 text-6xl sm:text-7xl">Cuéntanos de ti.</h1>
      <p className="mt-4 text-lg">
        Los comentaristas de la transmisión van a hablar de los corredores durante la carrera. Contesta lo que quieras de estas preguntas
        para que tengan algo que contar de ti. Ninguna es obligatoria, y solo la organización y los comentaristas verán tus respuestas.
      </p>
      <p className="mt-2 text-sm text-ink-2">
        ¿No sabes tu dorsal? Búscalo en <Link href="/corredores" className="underline">Corredores</Link>. Puedes volver a enviar el formulario
        para corregir tus respuestas; el nuevo reemplaza al anterior.
      </p>
      <div className="mt-8 border-t-2 border-ink pt-8">
        <ProfileForm />
      </div>
    </Container>
  );
}
