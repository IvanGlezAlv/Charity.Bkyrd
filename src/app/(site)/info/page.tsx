import type { Metadata } from "next";
import {
  getActiveRace, getCheckpoints, getContacts, getDistances, getFaqs, getLocations, getSchedule, getSections,
} from "@/lib/data";
import { LOCATION_LABEL, mapsLinks } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/time";
import { Container, Section } from "@/components/ui/Section";
import { Markdown } from "@/components/ui/Markdown";
import { RaceMap, type MapMarker } from "@/components/map/RaceMap";
import { LocationCard } from "@/components/site/LocationCard";

export const metadata: Metadata = { title: "Información" };

export default async function InfoPage() {
  const race = (await getActiveRace())!;
  const [locations, schedule, distances, checkpoints, sections, faqs, contacts] = await Promise.all([
    getLocations(race.id), getSchedule(race.id), getDistances(race.id), getCheckpoints(race.id),
    getSections(race.id, "info"), getFaqs(race.id), getContacts(race.id),
  ]);
  const publicLocations = locations.filter((l) => l.is_public);
  const visibleDistances = distances.filter((d) => d.is_published);
  const markers: MapMarker[] = publicLocations
    .filter((l) => l.latitude != null && l.longitude != null)
    .map((l) => ({ lat: Number(l.latitude), lng: Number(l.longitude), label: l.name, kind: l.kind, detail: LOCATION_LABEL[l.kind] }));
  if (markers.length === 0 && race.latitude != null && race.longitude != null) {
    markers.push({ lat: Number(race.latitude), lng: Number(race.longitude), label: race.venue_name ?? race.name, kind: "venue" });
  }
  const venueLinks = race.latitude != null && race.longitude != null ? mapsLinks(Number(race.latitude), Number(race.longitude), race.venue_name ?? undefined) : null;
  const emergency = contacts.filter((c) => c.is_public && (c.kind === "emergency" || c.kind === "medical"));
  const organizers = contacts.filter((c) => c.is_public && (c.kind === "organizer" || c.kind === "other"));
  const aid = checkpoints.filter((c) => visibleDistances.some((d) => d.id === c.distance_id));
  const faqList = faqs.filter((f) => f.is_published);

  const toc = [
    { id: "ubicacion", label: "Ubicación" },
    ...(schedule.length ? [{ id: "programa", label: "Programa" }] : []),
    ...(visibleDistances.length ? [{ id: "salidas", label: "Salidas y cortes" }] : []),
    ...sections.map((s) => ({ id: s.slug, label: s.title })),
    ...(emergency.length ? [{ id: "emergencias", label: "Emergencias" }] : []),
    ...(faqList.length ? [{ id: "preguntas", label: "Preguntas frecuentes" }] : []),
    { id: "contacto", label: "Contacto" },
  ];

  return (
    <Container className="pt-10">
      <p className="eyebrow">Información de la carrera</p>
      <h1 className="display mt-2 text-6xl sm:text-8xl">Todo lo que necesitas saber.</h1>
      <nav aria-label="En esta página" className="mt-8 flex flex-wrap gap-2">
        {toc.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="eyebrow border border-ink px-3 py-2 hover:bg-ink hover:text-paper">{t.label}</a>
        ))}
      </nav>

      <Section id="ubicacion" title="Ubicación" eyebrow={race.event_date ? formatDate(race.event_date, race.timezone, "full") : undefined} className="mt-10">
        <div className="mb-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            {race.venue_name && <p className="display text-4xl">{race.venue_name}</p>}
            {race.address && <p className="mt-1 text-lg">{race.address}</p>}
            {race.latitude != null && race.longitude != null && (
              <p className="mt-2 font-mono tabular">GPS {Number(race.latitude).toFixed(6)}, {Number(race.longitude).toFixed(6)}</p>
            )}
          </div>
          {venueLinks && (
            <div className="flex flex-wrap gap-2">
              <a className="btn" href={venueLinks.google} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>
              <a className="btn btn-ghost" href={venueLinks.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
            </div>
          )}
        </div>
        <RaceMap markers={markers} label="Mapa de la sede y puntos clave" />
        {publicLocations.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicLocations.map((l) => <LocationCard key={l.id} location={l} />)}
          </div>
        )}
      </Section>

      {schedule.length > 0 && (
        <Section id="programa" title="Programa">
          <ol className="border-t border-ink">
            {schedule.map((s) => (
              <li key={s.id} className="grid grid-cols-[6rem_1fr] gap-4 border-b border-line py-3 sm:grid-cols-[9rem_1fr]">
                <time className="font-mono text-lg tabular" dateTime={s.starts_at}>
                  {formatTime(s.starts_at, race.timezone)}
                  {s.ends_at && <span className="text-ink-3">–{formatTime(s.ends_at, race.timezone)}</span>}
                </time>
                <div>
                  <p className="font-bold">{s.title}</p>
                  {s.description && <p className="text-ink-2">{s.description}</p>}
                  {s.location_id && <p className="eyebrow mt-1 text-ink-3">{locations.find((l) => l.id === s.location_id)?.name}</p>}
                </div>
              </li>
            ))}
          </ol>
          <p className="eyebrow mt-3 text-ink-3">Horarios en hora local ({race.timezone})</p>
        </Section>
      )}

      {visibleDistances.length > 0 && (
        <Section id="salidas" title="Salidas y cortes">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="eyebrow border-b-2 border-ink">
                  <th className="py-2 pr-4">Distancia</th>
                  <th className="py-2 pr-4">Salida</th>
                  <th className="py-2 pr-4">{race.format === "backyard" ? "Tiempo por vuelta" : "Corte"}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDistances.map((d) => (
                  <tr key={d.id} className="border-b border-line">
                    <td className="py-3 pr-4 font-bold">{d.name}{d.distance_km ? ` · ${d.distance_km} km` : ""}</td>
                    <td className="py-3 pr-4 font-mono tabular">{d.start_time ? `${formatTime(d.start_time, race.timezone)} h` : "Por confirmar"}</td>
                    <td className="py-3 pr-4">
                      {race.format === "backyard"
                        ? `${d.loop_interval_minutes ?? 60} min. Nueva salida cada ${d.loop_interval_minutes ?? 60} min.`
                        : d.cutoff_minutes ? `${Math.floor(d.cutoff_minutes / 60)} h ${d.cutoff_minutes % 60} min` : "Sin corte"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aid.length > 0 && (
            <>
              <h3 className="eyebrow mb-2 mt-8">Abastecimientos y puntos de control</h3>
              <ul className="divide-y divide-line border-y border-ink">
                {aid.map((c) => (
                  <li key={c.id} className="grid grid-cols-[4.5rem_1fr] gap-3 py-3">
                    <span className="font-mono tabular">{c.km_mark != null ? `km ${c.km_mark}` : "—"}</span>
                    <span>
                      <span className="font-bold">{c.name}</span>
                      {c.services && <span className="text-ink-2"> · {c.services}</span>}
                      {c.cutoff_minutes && <span className="eyebrow ml-2 text-signal">Corte {Math.floor(c.cutoff_minutes / 60)}h{String(c.cutoff_minutes % 60).padStart(2, "0")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {sections.map((s) => (
        <Section key={s.id} id={s.slug} title={s.title}>
          <Markdown>{s.body}</Markdown>
        </Section>
      ))}

      {emergency.length > 0 && (
        <Section id="emergencias" title="Emergencias">
          <ul className="grid gap-3 sm:grid-cols-2">
            {emergency.map((c) => (
              <li key={c.id} className="border-2 border-signal p-4">
                <p className="eyebrow text-signal">{c.kind === "medical" ? "Médico" : "Emergencia"}</p>
                <p className="text-lg font-bold">{c.name}{c.role ? ` · ${c.role}` : ""}</p>
                {c.phone && <a className="mt-2 inline-block font-mono text-2xl tabular underline" href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>}
                {c.notes && <p className="mt-1 text-ink-2">{c.notes}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {faqList.length > 0 && (
        <Section id="preguntas" title="Preguntas frecuentes">
          <div className="divide-y divide-line border-y-2 border-ink">
            {faqList.map((f) => (
              <details key={f.id} className="group py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <span className="font-mono transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <Markdown className="prose-race mt-3">{f.answer}</Markdown>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section id="contacto" title="Contacto">
        <ul className="space-y-2 text-lg">
          {race.contact_email && <li>Correo: <a className="underline" href={`mailto:${race.contact_email}`}>{race.contact_email}</a></li>}
          {race.contact_phone && <li>Teléfono: <a className="underline" href={`tel:${race.contact_phone.replace(/\s/g, "")}`}>{race.contact_phone}</a></li>}
          {organizers.map((c) => (
            <li key={c.id}>
              <span className="font-bold">{c.name}</span>{c.role ? ` · ${c.role}` : ""}
              {c.phone && <> · <a className="underline" href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a></>}
              {c.email && <> · <a className="underline" href={`mailto:${c.email}`}>{c.email}</a></>}
            </li>
          ))}
          {!race.contact_email && !race.contact_phone && organizers.length === 0 && <li className="text-ink-2">Datos de contacto por publicar.</li>}
        </ul>
      </Section>
    </Container>
  );
}
