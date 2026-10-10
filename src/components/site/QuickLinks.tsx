import Link from "next/link";
import type { Distance, Race } from "@/lib/types";
import { storageUrl } from "@/lib/env";

/** The three things a runner looks for first: where, the manual, the GPX. */
export function QuickLinks({ race, distances }: { race: Race; distances: Distance[] }) {
  const manualPdf = storageUrl(race.manual_pdf_path, { download: `manual-${race.slug}${race.manual_version ? `-v${race.manual_version}` : ""}.pdf` });
  const gpx = distances.filter((d) => d.gpx_path);
  const tile = "group flex min-h-36 flex-col justify-between border-2 border-ink bg-paper p-5 transition-colors hover:bg-ink hover:text-paper";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Link href="/info#ubicacion" className={tile}>
        <span className="eyebrow">01 · Ubicación</span>
        <span className="display text-4xl">Cómo llegar →</span>
        <span className="text-sm opacity-80">{race.venue_name ?? "Ver mapa y direcciones"}</span>
      </Link>
      <Link href="/manual" className={tile}>
        <span className="eyebrow">02 · Manual del corredor</span>
        <span className="display text-4xl">Leer manual →</span>
        <span className="text-sm opacity-80">
          {race.manual_version ? `Versión ${race.manual_version}` : "En línea"}
          {manualPdf && " · PDF disponible"}
        </span>
      </Link>
      {gpx.length === 1 ? (
        <a download href={storageUrl(gpx[0].gpx_path, { download: gpx[0].gpx_filename ?? `${gpx[0].slug}.gpx` })!} className={tile}>
          <span className="eyebrow">03 · Recorrido</span>
          <span className="display text-4xl">Descargar GPX ↓</span>
          <span className="text-sm opacity-80">{gpx[0].name}{gpx[0].distance_km ? ` · ${gpx[0].distance_km} km` : ""}</span>
        </a>
      ) : (
        <Link href="/recorrido" className={tile}>
          <span className="eyebrow">03 · Recorrido</span>
          <span className="display text-4xl">{gpx.length ? "Archivos GPX →" : "Ver recorrido →"}</span>
          <span className="text-sm opacity-80">{gpx.length ? `${gpx.length} archivos` : "GPX disponible pronto"}</span>
        </Link>
      )}
    </div>
  );
}
