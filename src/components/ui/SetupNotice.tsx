import { isSupabaseConfigured } from "@/lib/env";
import { Container } from "./Section";

/** Shown when Supabase isn't configured or no race has been published yet. */
export function SetupNotice() {
  return (
    <Container className="py-24">
      <p className="eyebrow mb-4">La Charity Bkyrd Ultra</p>
      <h1 className="display text-6xl sm:text-8xl">Muy pronto.</h1>
      <p className="mt-6 max-w-xl text-lg text-ink-2">
        {isSupabaseConfigured
          ? "La información de la carrera todavía no está publicada."
          : "El sitio aún no está conectado a su base de datos. Configura las variables de entorno de Supabase (ver README)."}
      </p>
    </Container>
  );
}
