import Link from "next/link";
import {
  getActiveRace, getAnnouncements, getDistances, getPodcast, getSchedule, getSections, getSponsors, liveAnnouncements,
} from "@/lib/data";
import { getPublicResults } from "@/lib/results";
import { storageUrl } from "@/lib/env";
import { EVENT_STATUS_LABEL, PARTICIPATION_LABEL, PUBLICATION_LABEL } from "@/lib/labels";
import { distanceSummary, firstStart } from "@/lib/race";
import { formatDate, formatElapsed, formatTime } from "@/lib/time";
import { Container, Section } from "@/components/ui/Section";
import { Markdown } from "@/components/ui/Markdown";
import { Announcements } from "@/components/site/Announcements";
import { QuickLinks } from "@/components/site/QuickLinks";
import { RaceCountdown } from "@/components/site/RaceCountdown";

export default async function HomePage() {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const [distances, announcements, schedule, sections, sponsors, podcast] = await Promise.all([
    getDistances(race.id),
    getAnnouncements(race.id),
    getSchedule(race.id),
    getSections(race.id, "home"),
    getSponsors(race.id),
    getPodcast(race.id),
  ]);
  const publicDistances = distances.filter((d) => d.is_published);
  const start = firstStart(publicDistances);
  const firstDistance = publicDistances.find((d) => d.start_time === start);
  const showCountdown = start && (race.event_status === "upcoming" || race.event_status === "race_day");
  const live = liveAnnouncements(announcements);
  const showResults = race.results_publication !== "hidden";
  const results = showResults ? (await getPublicResults(race.id)).rows : [];
  const hero = storageUrl(race.hero_image_path) ?? "/brand/las-riberas-landscape.webp";
  const visibleSponsors = sponsors.filter((s) => s.is_published);
  const episodes = podcast.filter((p) => p.is_published);

  return (
    <>
      {/* Hero: poster layout */}
      <Container className="pt-8 sm:pt-12">
        <div className="eyebrow flex flex-wrap justify-between gap-2 border-b-2 border-ink pb-3">
          <span>{race.event_date ? formatDate(race.event_date, race.timezone, "full") : "Fecha por confirmar"}</span>
          {start && <span>Inicio {formatTime(start, race.timezone)} h</span>}
          <span className={race.event_status === "race_day" ? "text-signal" : ""}>
            {race.event_status === "race_day" && "● "}
            {EVENT_STATUS_LABEL[race.event_status]}
          </span>
        </div>
        <div className="grid gap-8 py-8 md:grid-cols-[1.2fr_1fr] md:gap-12 md:py-12">
          <h1 className="display text-mega">{race.name}</h1>
          <div className="flex flex-col justify-end gap-5">
            {race.tagline && <p className="font-mono text-lg font-bold uppercase leading-snug">{race.tagline}</p>}
            {race.description && <Markdown className="prose-race font-mono text-[0.95rem] uppercase leading-relaxed">{race.description}</Markdown>}
            <p className="eyebrow inline-flex w-fit border-2 border-ink px-3 py-2">Inscripciones cerradas</p>
          </div>
        </div>
        {showCountdown && (
          <div className="flex items-center gap-2 pb-8 sm:gap-6 md:pb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/portrait-cap.webp" alt="" className="w-[17%] max-w-44 shrink-0 mix-blend-multiply" />
            <div className="min-w-0 flex-1">
              <RaceCountdown startIso={start} intervalMinutes={race.format === "backyard" ? firstDistance?.loop_interval_minutes ?? 60 : null} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/portrait-cap.webp" alt="" className="w-[17%] max-w-44 shrink-0 mix-blend-multiply" />
          </div>
        )}
      </Container>

      <div className="relative border-y-2 border-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt={race.venue_name ? `Paisaje de ${race.venue_name}` : "Paisaje de la sede"} className="h-[42vh] min-h-64 w-full object-cover grayscale" />
        {race.venue_name && (
          <p className="absolute inset-x-0 bottom-6 text-center font-mono text-3xl uppercase tracking-wide text-ink sm:text-5xl">
            <span className="bg-paper/85 px-3">@ {race.venue_name}</span>
          </p>
        )}
      </div>

      <Container>
        <div className="py-8">
          <QuickLinks race={race} distances={publicDistances} />
        </div>

        {live.length > 0 && (
          <div className="pb-8">
            <Announcements items={live} race={race} />
          </div>
        )}

        {showResults && (
          <Section title="Resultados" eyebrow={`${PUBLICATION_LABEL[race.results_publication]}${race.event_status === "race_day" ? " · en vivo" : ""}`}>
            {results.length === 0 ? (
              <p className="text-ink-2">Aún no hay tiempos registrados.</p>
            ) : (
              <ol className="divide-y divide-line border-y-2 border-ink">
                {results.filter((r) => r.overall_rank).slice(0, 5).map((r) => (
                  <li key={r.registration_id} className="flex items-center gap-4 py-3">
                    <span className="display w-12 text-4xl tabular">{r.overall_rank}</span>
                    <span className="flex-1">
                      <span className="font-bold">{r.first_name} {r.last_name}</span>
                      <span className="eyebrow ml-2 text-ink-3">#{r.bib}</span>
                    </span>
                    <span className="font-mono tabular">
                      {race.format === "backyard" ? `${r.laps_completed} vueltas` : formatElapsed(r.gun_elapsed_ms)}
                    </span>
                    <span className="eyebrow hidden w-24 text-right sm:block">{PARTICIPATION_LABEL[r.status]}</span>
                  </li>
                ))}
              </ol>
            )}
            <Link href="/resultados" className="btn mt-6">Ver todos los resultados</Link>
          </Section>
        )}

        {sections.map((s) => (
          <Section key={s.id} id={s.slug} title={s.title}>
            <Markdown>{s.body}</Markdown>
          </Section>
        ))}

        {publicDistances.length > 0 && (
          <Section title={race.format === "backyard" ? "El loop" : "Distancias"} eyebrow={`${publicDistances.length} ${publicDistances.length === 1 ? "recorrido" : "recorridos"}`}>
            <div className="grid gap-4 md:grid-cols-2">
              {publicDistances.map((d) => (
                <Link key={d.id} href={`/recorrido/${d.slug}`} className="group grid grid-cols-[auto_1fr] items-end gap-6 border-2 border-ink p-5 hover:bg-ink hover:text-paper">
                  <span className="display text-7xl tabular sm:text-8xl">
                    {d.distance_km ? Number(d.distance_km).toLocaleString("es-MX") : "—"}
                    <span className="text-3xl">km</span>
                  </span>
                  <span>
                    <span className="block text-xl font-bold">{d.name}</span>
                    <span className="eyebrow block opacity-80">{distanceSummary(race, d)}</span>
                    {d.start_time && <span className="eyebrow block opacity-80">Salida {formatTime(d.start_time, race.timezone)} h</span>}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {schedule.length > 0 && (
          <Section title="Programa" eyebrow={race.event_date ? formatDate(race.event_date, race.timezone) : undefined}>
            <ol className="border-t border-ink">
              {schedule.map((s) => (
                <li key={s.id} className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-line py-3 sm:grid-cols-[8rem_1fr]">
                  <time className="font-mono text-lg tabular" dateTime={s.starts_at}>
                    {formatTime(s.starts_at, race.timezone)}
                    {s.ends_at && <span className="text-ink-3">–{formatTime(s.ends_at, race.timezone)}</span>}
                  </time>
                  <div>
                    <p className="font-bold">{s.title}</p>
                    {s.description && <p className="text-ink-2">{s.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/info#programa" className="btn btn-ghost mt-6">Programa completo</Link>
          </Section>
        )}

        {episodes.length > 0 && (
          <Section title="La Charity Endurance Team" eyebrow="Podcast">
            <ul className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-4" aria-label="Episodios">
              {episodes.map((ep) => {
                const cover = ep.cover_path?.startsWith("/") ? ep.cover_path : storageUrl(ep.cover_path);
                const body = (
                  <>
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="aspect-square w-full border-b-2 border-ink bg-white object-contain p-2" />
                    )}
                    <span className="flex flex-1 flex-col p-3">
                      {ep.episode_number && <span className="eyebrow block">Ep. {String(ep.episode_number).padStart(2, "0")}</span>}
                      <span className="display block text-2xl">{ep.title}</span>
                      {ep.description && <span className="mt-1 block text-sm text-ink-2">{ep.description}</span>}
                      <span className={`eyebrow mt-auto block pt-3 ${ep.listen_url ? "" : "text-ink-3"}`}>
                        {ep.listen_url ? "Escuchar ↗" : "Próximamente"}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li
                    key={ep.id}
                    className="flex w-[calc((100%-1rem)/2.2)] shrink-0 snap-start flex-col border-2 border-ink bg-paper sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]"
                  >
                    {ep.listen_url ? (
                      <a href={ep.listen_url} target="_blank" rel="noopener noreferrer" className="flex flex-1 flex-col hover:bg-paper-2" aria-label={`Escuchar ${ep.title}`}>{body}</a>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
            {episodes.length > 4 && <p className="eyebrow text-ink-3">Desliza para ver más →</p>}
          </Section>
        )}

        <Section title="El cartel" eyebrow={race.event_date ? formatDate(race.event_date, race.timezone) : undefined}>
          <div className="grid items-start gap-6 md:grid-cols-2">
            {[
              { src: "/brand/poster-vol-ii.webp", alt: "Cartel de La Charity Bckyrd Ultra Vol. II: sábado 28.11.2026, inicio 4:00 PM, @ Las Riberas" },
              { src: "/brand/flyer.webp", alt: "Cartel de La Charity Bkyard Ultra: loop de 6ish km, last man standing, Las Riberas, 28.11.2026" },
            ].map((f) => (
              <a key={f.src} href={f.src} target="_blank" rel="noopener noreferrer" className="block border-2 border-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} alt={f.alt} className="w-full" />
              </a>
            ))}
          </div>
        </Section>

        {visibleSponsors.length > 0 && (
          <Section title="Patrocinadores">
            <ul className="grid grid-cols-2 items-center gap-px border-2 border-ink bg-ink sm:grid-cols-3 lg:grid-cols-5">
              {visibleSponsors.map((s) => {
                const logo = s.logo_path?.startsWith("/") ? s.logo_path : storageUrl(s.logo_path);
                const inner = logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={s.name} className="max-h-14 w-auto max-w-full mix-blend-multiply grayscale" />
                ) : (
                  <span className="font-mono font-bold uppercase">{s.name}</span>
                );
                return (
                  <li key={s.id} className="flex h-28 items-center justify-center bg-paper p-4">
                    {s.website_url ? <a href={s.website_url} target="_blank" rel="noopener noreferrer">{inner}</a> : inner}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </Container>
    </>
  );
}
