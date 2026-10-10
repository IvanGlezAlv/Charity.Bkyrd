import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { findByBib } from "@/lib/timing/console";
import { formatDateTime, toLocalInputValue } from "@/lib/time";
import type { RosterEntry, TimingEvent } from "@/lib/types";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { EventRowActions } from "./EventRowActions";

export const metadata = { title: "Registros y correcciones" };

const KIND = { start: "Salida", lap: "Vuelta", checkpoint: "Control", finish: "Llegada" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TimingRecordsPage({ searchParams }: PageProps<"/admin/cronometraje/registros">) {
  await requirePageRole("timer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: rosterData } = await supabase.from("staff_roster").select("*").eq("race_id", race.id);
  const roster = (rosterData ?? []) as RosterEntry[];
  const bibQuery = one(sp.dorsal);
  const runnerId = UUID.test(one(sp.corredor)) ? one(sp.corredor) : findByBib(roster, bibQuery)?.registration_id;

  let query = supabase.from("timing_events").select("*").eq("race_id", race.id).order("recorded_at", { ascending: false }).limit(200);
  if (runnerId) query = query.eq("registration_id", runnerId);
  const { data, error } = await query;
  const events = (data ?? []) as TimingEvent[];
  const byId = new Map(roster.map((r) => [r.registration_id, r]));
  const runner = runnerId ? byId.get(runnerId) : undefined;

  return (
    <AdminPage wide>
      <PageHeader
        title="Registros"
        description="Corrige o anula registros con un motivo. Nada se borra: los registros anulados quedan tachados en el historial y en la auditoría."
        actions={<Link className="btn" href="/admin/cronometraje">Volver a cronometraje</Link>}
      />
      <form className="mb-6 flex flex-wrap gap-2">
        <input className="field max-w-40" name="dorsal" defaultValue={bibQuery} placeholder="Dorsal" inputMode="numeric" aria-label="Dorsal" />
        <button className="btn">Buscar</button>
        {runnerId && <Link className="btn btn-ghost" href="/admin/cronometraje/registros">Ver todos</Link>}
      </form>
      {bibQuery && !runnerId && <p className="mb-4 text-signal">No hay corredor con dorsal {bibQuery}.</p>}
      {runner && <h2 className="display mb-4 text-3xl">#{runner.bib} {runner.first_name} {runner.last_name}</h2>}
      {error && <p role="alert" className="text-signal">{error.message}</p>}
      {events.length === 0 ? <p className="text-ink-2">Sin registros.</p> : (
        <ul className="divide-y divide-line border-y-2 border-ink">
          {events.map((e) => {
            const r = byId.get(e.registration_id);
            const voided = Boolean(e.voided_at);
            return (
              <li key={e.id} className={`py-3 ${voided ? "text-ink-2" : ""}`}>
                <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 ${voided ? "line-through" : ""}`}>
                  <span className="font-mono font-bold">{r?.bib ?? "—"}</span>
                  {!runner && <Link className="hover:underline" href={`?corredor=${e.registration_id}`}>{r?.first_name} {r?.last_name}</Link>}
                  <span>{KIND[e.kind]}{e.lap_number ? ` ${e.lap_number}` : ""}</span>
                  <span className="font-mono tabular">{formatDateTime(e.recorded_at, race.timezone, { timeStyle: "medium", dateStyle: "short" })}</span>
                  <span className="font-mono text-xs uppercase text-ink-2">{e.source}</span>
                </div>
                {voided ? (
                  <p className="text-xs">Anulado {formatDateTime(e.voided_at!, race.timezone)}: {e.void_reason}{e.replaced_by && " (reemplazado)"}</p>
                ) : (
                  <EventRowActions eventId={e.id} localValue={toLocalInputValue(e.recorded_at, race.timezone, true)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminPage>
  );
}
