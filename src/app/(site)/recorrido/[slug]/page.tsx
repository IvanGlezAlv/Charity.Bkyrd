import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveRace, getCheckpoints, getDistances, getLocations } from "@/lib/data";
import { storageUrl } from "@/lib/env";
import { LOCATION_LABEL } from "@/lib/labels";
import { formatTime } from "@/lib/time";
import { Container, Section } from "@/components/ui/Section";
import { Markdown } from "@/components/ui/Markdown";
import { RaceMap, type MapMarker } from "@/components/map/RaceMap";
import { ElevationProfile } from "@/components/map/ElevationProfile";
import { LocationCard } from "@/components/site/LocationCard";

export async function generateMetadata(props: PageProps<"/recorrido/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const race = await getActiveRace();
  const d = race ? (await getDistances(race.id)).find((x) => x.slug === slug) : null;
  return { title: d ? d.name : "Recorrido" };
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-2 border-ink p-4">
      <dt className="eyebrow text-ink-2">{label}</dt>
      <dd className="display mt-1 text-5xl tabular">{value}</dd>
      {note && <dd className="eyebrow mt-1 text-ink-3">{note}</dd>}
    </div>
  );
}

export default async function CoursePage(props: PageProps<"/recorrido/[slug]">) {
  const { slug } = await props.params;
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const [distances, checkpoints, locations] = await Promise.all([getDistances(race.id), getCheckpoints(race.id), getLocations(race.id)]);
  const d = distances.find((x) => x.slug === slug && x.is_published);
  if (!d) notFound();

  const cps = checkpoints.filter((c) => c.distance_id === d.id);
  const start = locations.find((l) => l.id === d.start_location_id);
  const finish = locations.find((l) => l.id === d.finish_location_id);
  const markers: MapMarker[] = [
    ...[start, finish].filter((l): l is NonNullable<typeof l> => Boolean(l && l.latitude != null && l.longitude != null))
      .map((l) => ({ lat: Number(l.latitude), lng: Number(l.longitude), label: l.name, kind: l === start ? "start" : "finish", detail: LOCATION_LABEL[l.kind] })),
    ...cps.filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({ lat: Number(c.latitude), lng: Number(c.longitude), label: c.name, kind: c.kind === "aid_station" ? "aid_station" : "checkpoint", detail: c.km_mark != null ? `km ${c.km_mark}` : undefined })),
  ];
  const gpxName = d.gpx_filename ?? `${d.slug}.gpx`;
  const gpxUrl = storageUrl(d.gpx_path, { download: gpxName });
  const routeImage = storageUrl(d.route_image_path);
  const backyard = race.format === "backyard";

  return (
    <Container className="pt-10">
      <p className="eyebrow">Recorrido</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
        <h1 className="display text-6xl sm:text-8xl">{d.name}</h1>
        {gpxUrl ? (
          <a href={gpxUrl} download={gpxName} className="btn min-h-14 px-6 text-base">Descargar GPX ↓</a>
        ) : (
          <p className="eyebrow border border-ink px-3 py-2">GPX disponible pronto</p>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={backyard ? "Distancia por vuelta" : "Distancia"} value={d.distance_km ? `${Number(d.distance_km).toLocaleString("es-MX")} km` : "—"} note="Oficial" />
        <Stat label="Desnivel +" value={d.elevation_gain_m != null ? `${d.elevation_gain_m} m` : d.gpx_stats?.has_elevation ? `${d.gpx_stats.gain_m} m` : "—"} note={d.elevation_gain_m != null ? "Oficial" : d.gpx_stats?.has_elevation ? "Según GPX" : undefined} />
        <Stat label="Desnivel −" value={d.elevation_loss_m != null ? `${d.elevation_loss_m} m` : d.gpx_stats?.has_elevation ? `${d.gpx_stats.loss_m} m` : "—"} note={d.elevation_loss_m != null ? "Oficial" : d.gpx_stats?.has_elevation ? "Según GPX" : undefined} />
        {backyard ? (
          <Stat label="Tiempo por vuelta" value={`${d.loop_interval_minutes ?? 60} min`} note={d.start_time ? `1ª salida ${formatTime(d.start_time, race.timezone)} h` : undefined} />
        ) : (
          <Stat label="Salida" value={d.start_time ? formatTime(d.start_time, race.timezone) : "—"} note={d.cutoff_minutes ? `Corte ${Math.floor(d.cutoff_minutes / 60)}h${String(d.cutoff_minutes % 60).padStart(2, "0")}` : undefined} />
        )}
      </dl>

      <div className={`mt-8 grid items-start gap-6 ${routeImage ? "md:grid-cols-[1fr_18rem] lg:grid-cols-[1fr_20rem]" : ""}`}>
        <div>
          <RaceMap markers={markers} route={d.route_geojson?.coordinates} height={420} label={`Mapa del recorrido ${d.name}`} />
          {d.gpx_stats && (
            <p className="eyebrow mt-2 text-ink-3">
              Trazado del archivo GPX: {d.gpx_stats.distance_km} km medidos · {d.gpx_stats.points.toLocaleString("es-MX")} puntos
              {d.gpx_stats.has_elevation && d.gpx_stats.min_ele_m != null ? ` · altitud ${d.gpx_stats.min_ele_m}–${d.gpx_stats.max_ele_m} m` : ""}
            </p>
          )}
        </div>
        {routeImage && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={routeImage} alt={`Ruta ${d.name}`} className="w-full border-2 border-ink" loading="lazy" />
          </figure>
        )}
      </div>

      {d.elevation_profile && d.elevation_profile.length > 1 && (
        <Section title="Perfil" className="mt-10">
          <ElevationProfile points={d.elevation_profile} checkpoints={cps.filter((c) => c.km_mark != null).map((c) => ({ km: Number(c.km_mark), name: c.name }))} />
        </Section>
      )}

      {d.description && (
        <Section title="Descripción">
          <Markdown>{d.description}</Markdown>
        </Section>
      )}

      {(start || finish) && (
        <Section title="Salida y meta">
          <div className="grid gap-4 sm:grid-cols-2">
            {start && <LocationCard location={start} />}
            {finish && finish.id !== start?.id && <LocationCard location={finish} />}
          </div>
        </Section>
      )}

      {cps.length > 0 && (
        <Section title="Abastecimientos y controles">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="eyebrow border-b-2 border-ink">
                  <th className="py-2 pr-3">Km</th>
                  <th className="py-2 pr-3">Punto</th>
                  <th className="py-2 pr-3">Servicios</th>
                  <th className="py-2">Corte</th>
                </tr>
              </thead>
              <tbody>
                {cps.map((c) => (
                  <tr key={c.id} className="border-b border-line align-top">
                    <td className="py-3 pr-3 font-mono tabular">{c.km_mark ?? "—"}</td>
                    <td className="py-3 pr-3 font-bold">{c.name}</td>
                    <td className="py-3 pr-3">{c.services ?? ""}{c.notes ? <span className="block text-ink-2">{c.notes}</span> : null}</td>
                    <td className="py-3 font-mono tabular">{c.cutoff_minutes ? `${Math.floor(c.cutoff_minutes / 60)}h${String(c.cutoff_minutes % 60).padStart(2, "0")}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {d.instructions && (
        <Section title="Indicaciones">
          <Markdown>{d.instructions}</Markdown>
        </Section>
      )}
    </Container>
  );
}
