import Link from "next/link";
import { requirePageRole, roleAllows } from "@/lib/auth";
import { getActiveRace, getDistances } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { EVENT_STATUS_LABEL, PUBLICATION_LABEL, flagLabel } from "@/lib/labels";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { YardClock } from "@/components/timing/YardClock";

export const metadata = { title: "Resumen" };

interface OverviewRow {
  distance_id: string;
  name: string;
  start_time: string | null;
  loop_interval_minutes: number | null;
  registered: number;
  starters: number;
  finished: number;
  on_course: number;
  not_yet_started: number;
  dns: number;
  dnf: number;
  dsq: number;
  flagged: number;
  awaiting_lap_record: number;
}

export default async function AdminHome(props: PageProps<"/admin">) {
  const session = await requirePageRole();
  const race = (await getActiveRace())!;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: overview, error }, distances, { data: flagged }] = await Promise.all([
    supabase.rpc("race_overview", { p_race_id: race.id }),
    getDistances(race.id),
    supabase.from("race_results").select("registration_id, flags, laps_completed, status").eq("race_id", race.id).neq("flags", "{}").limit(50),
  ]);
  const rows = (overview ?? []) as OverviewRow[];
  const flaggedIds = (flagged ?? []).map((f) => f.registration_id as string);
  const { data: roster } = flaggedIds.length
    ? await supabase.from("staff_roster").select("registration_id,bib,first_name,last_name").in("registration_id", flaggedIds)
    : { data: [] };
  const byId = new Map((roster ?? []).map((r) => [r.registration_id as string, r]));
  const backyard = race.format === "backyard";

  return (
    <AdminPage wide>
      <PageHeader
        title="Resumen del día"
        description={<>Estado del evento: <strong>{EVENT_STATUS_LABEL[race.event_status]}</strong> · Resultados: <strong>{PUBLICATION_LABEL[race.results_publication]}</strong>. Cifras calculadas en vivo desde la base de datos.</>}
        actions={roleAllows(session.roles, "timer") ? <Link href="/admin/cronometraje" className="btn">Abrir cronometraje</Link> : undefined}
      />
      {sp.error === "sin-permisos" && <p role="alert" className="mb-6 border-l-4 border-signal bg-signal/10 px-3 py-2 text-signal">No tienes permiso para esa sección.</p>}
      {error && <p role="alert" className="mb-6 text-signal">No se pudo cargar el resumen: {error.message}</p>}

      {backyard && distances.filter((d) => d.start_time).map((d) => (
        <div key={d.id} className="mb-6 border-2 border-ink bg-ink p-4">
          <YardClock startIso={d.start_time!} intervalMinutes={d.loop_interval_minutes ?? 60} timezone={race.timezone} dark />
        </div>
      ))}

      {rows.map((r) => {
        const metrics: [string, number, string?][] = [
          ["Inscritos", r.registered],
          ["Tomaron la salida", r.starters],
          [backyard ? "Siguen en carrera" : "En carrera (se espera su llegada)", r.on_course],
          [backyard ? "Last one standing" : "Finalizaron", r.finished],
          ["DNS", r.dns],
          ["DNF", r.dnf],
          ["Descalificados", r.dsq],
          ["Resultados con alertas", r.flagged, r.flagged ? "text-signal" : undefined],
          ...(backyard ? [["Sin registro de su última vuelta", r.awaiting_lap_record, r.awaiting_lap_record ? "text-signal" : undefined] as [string, number, string?]] : []),
        ];
        return (
          <section key={r.distance_id} className="mb-8">
            {rows.length > 1 && <h2 className="eyebrow mb-2">{r.name}</h2>}
            <dl className="grid grid-cols-2 gap-px border-2 border-ink bg-ink sm:grid-cols-3 lg:grid-cols-5">
              {metrics.map(([label, value, cls]) => (
                <div key={label} className="bg-paper p-4">
                  <dt className="eyebrow text-ink-2">{label}</dt>
                  <dd className={`display mt-1 text-5xl tabular ${cls ?? ""}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {backyard && r.awaiting_lap_record > 0 && (
              <p className="mt-2 text-sm text-ink-2">
                “Sin registro de su última vuelta” cuenta corredores en carrera cuya vuelta ya terminó en el reloj pero no tiene tiempo capturado.
                Revísalo con el staff: no significa que hayan abandonado.
              </p>
            )}
          </section>
        );
      })}
      {rows.length === 0 && !error && <p className="text-ink-2">Agrega una distancia en “Carrera y distancias” para ver el resumen.</p>}

      <section>
        <h2 className="display mb-3 text-3xl">Alertas por revisar</h2>
        {(flagged ?? []).length === 0 ? (
          <p className="text-ink-2">Sin alertas.</p>
        ) : (
          <ul className="divide-y divide-line border-y-2 border-ink">
            {(flagged ?? []).map((f) => {
              const r = byId.get(f.registration_id as string);
              return (
                <li key={f.registration_id as string} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                  <span className="font-mono tabular">#{r?.bib ?? "?"}</span>
                  <span className="font-bold">{r ? `${r.first_name} ${r.last_name}` : "Corredor"}</span>
                  <span className="text-sm text-signal">{(f.flags as string[]).map(flagLabel).join(" · ")}</span>
                  {roleAllows(session.roles, "timer") && (
                    <Link className="ml-auto text-sm underline" href={`/admin/cronometraje/registros?registro=${f.registration_id}`}>Ver registros</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminPage>
  );
}
