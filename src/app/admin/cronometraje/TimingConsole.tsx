"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/browser";
import { friendlyError } from "@/lib/admin/action-state";
import { useServerClock } from "@/lib/timing/clock";
import { OUT_STATUSES, applyEventChange, backyardState, compareBibs, findByBib, groupEvents, type YardState } from "@/lib/timing/console";
import { PARTICIPATION_LABEL } from "@/lib/labels";
import { formatTime, yardAt } from "@/lib/time";
import { YardClock } from "@/components/timing/YardClock";
import type { ParticipationStatus, RaceFormat, RosterEntry, TimingEvent, TimingKind } from "@/lib/types";

interface Props {
  raceId: string;
  raceName: string;
  format: RaceFormat;
  timezone: string;
  distances: { id: string; name: string; start_time: string | null; loop_interval_minutes: number | null }[];
  checkpoints: { id: string; name: string; distance_id: string }[];
  resultsOfficial: boolean;
}

type Mode = { kind: TimingKind; checkpointId?: string };
type RpcResult =
  | { result: "recorded"; event: TimingEvent; replaced: TimingEvent | null }
  | { result: "duplicate"; event: TimingEvent }
  | { result: "conflict"; reason: "exists" | "lap_already_recorded"; lap_number?: number; existing: TimingEvent | null };

interface Pending {
  clientEventId: string;
  registrationId: string;
  kind: TimingKind;
  lapNumber: number | null;
  checkpointId: string | null;
  recordedAt: string | null;
  overwrite: boolean;
  reason: string | null;
}
interface Toast { id: string; ok: boolean; text: string; eventId?: string }
interface Conflict { pending: Pending; existing: TimingEvent | null; lapNumber: number | null }
type Filter = "pending" | "all" | "out";

const KIND_LABEL: Record<TimingKind, string> = { start: "Salida", lap: "Vuelta", checkpoint: "Control", finish: "Llegada" };
const PAGE = 1000;

function deviceId(): string {
  try {
    const key = "timing-device-id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID().slice(0, 8);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "sin-id";
  }
}

export function TimingConsole(props: Props) {
  const { raceId, format, timezone, distances, checkpoints } = props;
  const backyard = format === "backyard";
  const supabase = getBrowserClient();
  const { sync, failed: syncFailed } = useServerClock();
  const offset = sync?.offsetMs ?? 0;

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [events, setEvents] = useState<TimingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [mode, setMode] = useState<Mode>({ kind: backyard ? "lap" : "finish" });
  const [bib, setBib] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bibInput = useRef<HTMLInputElement>(null);
  const device = useMemo(() => (typeof window === "undefined" ? "" : deviceId()), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);

  // ---- data -------------------------------------------------------------
  const loadRoster = useCallback(async () => {
    const { data, error } = await supabase.from("staff_roster").select("*").eq("race_id", raceId);
    if (error) throw error;
    setRoster(((data ?? []) as RosterEntry[]).sort((a, b) => compareBibs(a.bib, b.bib)));
  }, [supabase, raceId]);

  const loadEvents = useCallback(async () => {
    const all: TimingEvent[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("timing_events").select("*").eq("race_id", raceId)
        .is("voided_at", null).order("recorded_at").range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...((data ?? []) as TimingEvent[]));
      if (!data || data.length < PAGE) break;
    }
    setEvents(all);
  }, [supabase, raceId]);

  const reload = useCallback(async () => {
    try {
      await Promise.all([loadRoster(), loadEvents()]);
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [loadRoster, loadEvents]);

  useEffect(() => {
    const first = setTimeout(reload, 0);
    const channel = supabase
      .channel(`timing-${raceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "timing_events", filter: `race_id=eq.${raceId}` },
        (p: { new: TimingEvent }) => p.new?.id && setEvents((ev) => applyEventChange(ev, p.new)))
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations", filter: `race_id=eq.${raceId}` },
        (p: { eventType: string; new: { id: string; status: ParticipationStatus; status_reason: string | null; bib: string | null } }) => {
          if (p.eventType !== "UPDATE") return void loadRoster().catch(() => {});
          setRoster((r) => r.map((x) => x.registration_id === p.new.id ? { ...x, status: p.new.status, status_reason: p.new.status_reason, bib: p.new.bib } : x));
        })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          reload(); // catch anything missed while disconnected
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    return () => { clearTimeout(first); supabase.removeChannel(channel); };
  }, [supabase, raceId, reload, loadRoster]);

  const byReg = useMemo(() => groupEvents(events), [events]);
  const nameOf = useCallback((id: string) => {
    const r = roster.find((x) => x.registration_id === id);
    return r ? `${r.bib ? `#${r.bib} ` : ""}${r.first_name} ${r.last_name}` : "Corredor";
  }, [roster]);

  // ---- recording --------------------------------------------------------
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((list) => [{ ...t, id }, ...list].slice(0, 4));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ok ? 8000 : 15000);
  }, []);

  const send = useCallback(async (p: Pending): Promise<void> => {
    setBusy((b) => new Set(b).add(p.registrationId));
    try {
      const { data, error } = await supabase.rpc("record_timing_event", {
        p_race_id: raceId,
        p_registration_id: p.registrationId,
        p_kind: p.kind,
        p_lap_number: p.lapNumber,
        p_checkpoint_id: p.checkpointId,
        p_recorded_at: p.recordedAt,
        p_client_event_id: p.clientEventId,
        p_overwrite: p.overwrite,
        p_reason: p.reason,
        p_source: "manual",
        p_device_id: device,
      });
      if (error) {
        if (!error.code) {
          // Network failure: keep it queued with the same id, so a retry can never record it twice.
          setQueue((q) => (q.some((x) => x.clientEventId === p.clientEventId) ? q : [...q, p]));
          return;
        }
        setQueue((q) => q.filter((x) => x.clientEventId !== p.clientEventId));
        toast({ ok: false, text: `${nameOf(p.registrationId)}: ${friendlyError(error)}` });
        return;
      }
      setQueue((q) => q.filter((x) => x.clientEventId !== p.clientEventId));
      const res = data as RpcResult;
      if (res.result === "conflict") {
        setConflict({ pending: p, existing: res.existing, lapNumber: res.lap_number ?? res.existing?.lap_number ?? p.lapNumber });
        return;
      }
      setEvents((ev) => applyEventChange(res.result === "recorded" && res.replaced ? applyEventChange(ev, { ...res.replaced, voided_at: res.event.created_at }) : ev, res.event));
      const e = res.event;
      const what = e.kind === "lap" ? `vuelta ${e.lap_number}` : e.kind === "checkpoint" ? `control${e.lap_number ? ` (vuelta ${e.lap_number})` : ""}` : KIND_LABEL[e.kind].toLowerCase();
      toast({ ok: true, text: `${nameOf(e.registration_id)} · ${what} · ${formatTime(e.recorded_at, timezone, true)}`, eventId: e.id });
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(p.registrationId); return n; });
    }
  }, [supabase, raceId, device, toast, nameOf, timezone]);

  // Retry queued records when the connection comes back.
  useEffect(() => {
    if (queue.length === 0) return;
    const retry = () => queue.forEach((p) => send(p));
    const id = setInterval(retry, 5000);
    window.addEventListener("online", retry);
    return () => { clearInterval(id); window.removeEventListener("online", retry); };
  }, [queue, send]);

  const record = useCallback((entry: RosterEntry, opts: Partial<Pending> = {}) => {
    if (busy.has(entry.registration_id)) return;
    const yard = backyard ? currentYard(entry.distance_id) : 0;
    const p: Pending = {
      clientEventId: crypto.randomUUID(),
      registrationId: entry.registration_id,
      kind: mode.kind,
      lapNumber: mode.kind === "checkpoint" && backyard ? Math.max(yard, 1) : null,
      checkpointId: mode.kind === "checkpoint" ? mode.checkpointId ?? null : null,
      // The moment of the tap on the server's clock, so a slow network does not delay the time.
      recordedAt: sync ? new Date(Date.now() + offset).toISOString() : null,
      overwrite: false,
      reason: null,
      ...opts,
    };
    if (p.kind === "checkpoint" && !p.checkpointId) {
      toast({ ok: false, text: "Elige el punto de control." });
      return;
    }
    send(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, backyard, mode, sync, offset, send, toast]);

  function currentYard(distanceId: string): number {
    const d = distances.find((x) => x.id === distanceId);
    if (!d?.start_time) return 0;
    const y = yardAt(now, d.start_time, d.loop_interval_minutes ?? 60);
    return y.started ? y.yard : 0;
  }

  const undo = async (eventId: string) => {
    const { error } = await supabase.rpc("void_timing_event", { p_event_id: eventId, p_reason: "Registro por error (deshecho desde la consola)" });
    if (error) return toast({ ok: false, text: friendlyError(error) });
    setEvents((ev) => ev.map((e) => (e.id === eventId ? { ...e, voided_at: new Date().toISOString() } : e)));
    setToasts((t) => t.filter((x) => x.eventId !== eventId));
    toast({ ok: true, text: "Registro anulado." });
  };

  const submitBib = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = findByBib(roster, bib);
    if (!entry) {
      toast({ ok: false, text: `No hay corredor con dorsal ${bib}.` });
    } else if (OUT_STATUSES.includes(entry.status) && entry.status !== "finished") {
      toast({ ok: false, text: `${nameOf(entry.registration_id)} está marcado como ${PARTICIPATION_LABEL[entry.status]}.` });
    } else {
      record(entry);
    }
    setBib("");
    bibInput.current?.focus();
  };

  // ---- view -------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const states = useMemo(() => {
    const m = new Map<string, YardState>();
    for (const r of roster) m.set(r.registration_id, backyardState(r, (byReg.get(r.registration_id) ?? []).filter((e) => e.kind === "lap"), currentYard(r.distance_id)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, byReg, now]);

  const visible = roster.filter((r) => {
    if (q && !`${r.bib ?? ""} ${r.first_name} ${r.last_name}`.toLowerCase().includes(q)) return false;
    const out = OUT_STATUSES.includes(r.status);
    if (filter === "out") return out;
    if (filter === "pending") {
      if (out) return false;
      if (backyard) return states.get(r.registration_id) !== "done";
      return !(byReg.get(r.registration_id) ?? []).some((e) => e.kind === mode.kind && (mode.kind !== "checkpoint" || e.checkpoint_id === mode.checkpointId));
    }
    return true;
  });
  const missing = roster.filter((r) => states.get(r.registration_id) === "missing_previous");
  const active = roster.filter((r) => !OUT_STATUSES.includes(r.status));
  const doneCount = backyard ? active.filter((r) => states.get(r.registration_id) === "done").length : 0;
  const mainDistance = distances.find((d) => d.start_time) ?? distances[0];
  const detailEntry = roster.find((r) => r.registration_id === detail);

  return (
    <div className="min-h-dvh bg-ink pb-24 text-paper">
      <header className="sticky top-0 z-20 border-b border-paper/20 bg-ink/95 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
          <Link href="/admin" className="text-paper/60 hover:text-paper">← Admin</Link>
          <span className={`ml-auto px-2 py-0.5 ${live === "live" ? "bg-ok text-ink" : live === "offline" ? "bg-signal" : "bg-paper/20"}`}>
            {live === "live" ? "En vivo" : live === "offline" ? "Sin conexión en vivo" : "Conectando"}
          </span>
          <span className={`px-2 py-0.5 ${sync ? "bg-paper/10" : "bg-signal"}`} title="Diferencia entre este dispositivo y el servidor">
            {sync ? `Reloj servidor ±${Math.max(1, Math.round(sync.rttMs / 2))} ms` : syncFailed ? "Sin hora del servidor" : "Sincronizando reloj"}
          </span>
          {queue.length > 0 && <span className="bg-signal px-2 py-0.5">{queue.length} por enviar</span>}
        </div>
        {backyard && mainDistance?.start_time && (
          <YardClock startIso={mainDistance.start_time} intervalMinutes={mainDistance.loop_interval_minutes ?? 60} timezone={timezone} serverOffsetMs={offset} dark />
        )}
        {props.resultsOfficial && (
          <p className="mt-2 bg-signal px-2 py-1 text-sm">Resultados oficiales: un administrador debe reabrirlos para registrar cambios.</p>
        )}
      </header>

      <div className="space-y-4 px-3 py-4 sm:px-6">
        {/* mode */}
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de registro">
          {(backyard ? (["lap", "checkpoint"] as TimingKind[]) : (["start", "finish", "checkpoint"] as TimingKind[])).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={mode.kind === k}
              onClick={() => setMode({ kind: k, checkpointId: k === "checkpoint" ? checkpoints[0]?.id : undefined })}
              disabled={k === "checkpoint" && checkpoints.length === 0}
              className={`border-2 px-4 py-2 font-mono text-sm uppercase tracking-wider disabled:opacity-30 ${mode.kind === k ? "border-paper bg-paper text-ink" : "border-paper/40"}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
          {mode.kind === "checkpoint" && (
            <select className="border-2 border-paper/40 bg-ink px-3 py-2" value={mode.checkpointId} onChange={(e) => setMode({ kind: "checkpoint", checkpointId: e.target.value })} aria-label="Punto de control">
              {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* bib entry */}
        <form onSubmit={submitBib} className="flex gap-2">
          <input ref={bibInput} value={bib} onChange={(e) => setBib(e.target.value)} inputMode="numeric" autoComplete="off" enterKeyHint="send"
            placeholder="Dorsal" aria-label="Dorsal"
            className="min-w-0 flex-1 border-2 border-paper bg-ink px-4 py-3 font-mono text-3xl tabular placeholder:text-paper/30 focus:outline-none" />
          <button className="bg-paper px-5 font-mono text-sm font-bold uppercase tracking-wider text-ink" disabled={!bib.trim()}>
            Registrar
          </button>
        </form>

        {/* feedback */}
        <div aria-live="polite" className="space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${t.ok ? "bg-ok/20" : "bg-signal"}`}>
              <span className="flex-1">{t.text}</span>
              {t.eventId && <button className="font-mono text-xs uppercase underline" onClick={() => undo(t.eventId!)}>Deshacer</button>}
            </div>
          ))}
        </div>

        {loadError && <p role="alert" className="bg-signal px-3 py-2">No se pudo cargar: {loadError} <button className="underline" onClick={reload}>Reintentar</button></p>}

        {backyard && missing.length > 0 && (
          <MissingLaps entries={missing} yardOf={currentYard} lapsOf={(id) => (byReg.get(id) ?? []).filter((e) => e.kind === "lap").map((e) => e.lap_number!)} onOpen={setDetail} />
        )}

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          {([["pending", backyard ? `Faltan en esta vuelta (${active.length - doneCount})` : "Pendientes"], ["all", `Todos (${roster.length})`], ["out", `Fuera (${roster.length - active.length})`]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${filter === f ? "bg-paper text-ink" : "bg-paper/10"}`}>{label}</button>
          ))}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre" aria-label="Buscar corredor"
            className="ml-auto min-w-0 flex-1 border border-paper/30 bg-ink px-3 py-1.5 text-sm sm:max-w-64" />
        </div>

        {/* runners */}
        {loading ? <p className="text-paper/60">Cargando corredores…</p> : visible.length === 0 ? (
          <p className="py-8 text-center text-paper/60">{filter === "pending" ? "Nadie pendiente en este momento." : "Sin corredores en esta vista."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((r) => {
              const evs = byReg.get(r.registration_id) ?? [];
              const laps = evs.filter((e) => e.kind === "lap").length;
              const last = evs[0];
              const state = states.get(r.registration_id);
              const out = OUT_STATUSES.includes(r.status);
              const pending = busy.has(r.registration_id);
              return (
                <li key={r.registration_id} className="relative">
                  <button type="button" onClick={() => record(r)} disabled={out && r.status !== "finished" || pending}
                    className={`flex h-full w-full flex-col items-start border-2 p-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed ${
                      out ? "border-paper/10 opacity-50" : state === "done" ? "border-ok/60 bg-ok/15" : state === "missing_previous" ? "border-signal" : "border-paper/40 hover:border-paper"
                    } ${pending ? "animate-pulse" : ""}`}>
                    <span className="font-mono text-3xl font-bold tabular leading-none">{r.bib ?? "—"}</span>
                    <span className="mt-1 line-clamp-1 text-sm">{r.first_name} {r.last_name}</span>
                    <span className="mt-1 font-mono text-[11px] uppercase tracking-wider text-paper/60">
                      {out ? PARTICIPATION_LABEL[r.status] : backyard ? `${laps} vuelta${laps === 1 ? "" : "s"}${state === "done" ? " · ✓" : ""}` : last ? `${KIND_LABEL[last.kind]} ${formatTime(last.recorded_at, timezone)}` : "Sin registros"}
                    </span>
                  </button>
                  <button type="button" onClick={() => setDetail(r.registration_id)} aria-label={`Detalle de ${r.first_name}`}
                    className="absolute right-1 top-1 px-2 py-1 font-mono text-paper/60 hover:text-paper">···</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {conflict && (
        <ConflictDialog conflict={conflict} name={nameOf(conflict.pending.registrationId)} timezone={timezone}
          onCancel={() => setConflict(null)}
          onOverwrite={(reason) => {
            const p = conflict.pending;
            setConflict(null);
            send({ ...p, clientEventId: crypto.randomUUID(), lapNumber: p.kind === "lap" ? conflict.lapNumber : p.lapNumber, overwrite: true, reason });
          }} />
      )}
      {detailEntry && (
        <RunnerSheet entry={detailEntry} events={byReg.get(detailEntry.registration_id) ?? []} timezone={timezone} checkpoints={checkpoints}
          onClose={() => setDetail(null)} onUndo={undo} onToast={toast} />
      )}
    </div>
  );
}

function ConflictDialog({ conflict, name, timezone, onCancel, onOverwrite }: {
  conflict: Conflict; name: string; timezone: string; onCancel: () => void; onOverwrite: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const e = conflict.existing;
  const doubleTap = conflict.pending.kind === "lap" && !conflict.pending.lapNumber;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="conflict-title" className="fixed inset-0 z-40 flex items-end bg-black/70 sm:items-center sm:justify-center">
      <div className="w-full max-w-md border-t-4 border-signal bg-paper p-5 text-ink sm:border-4">
        <h2 id="conflict-title" className="display text-3xl">Ya hay un registro</h2>
        <p className="mt-2">
          {name}: {conflict.pending.kind === "lap" ? `la vuelta ${conflict.lapNumber}` : KIND_LABEL[conflict.pending.kind].toLowerCase()} ya se registró
          {e && <> a las <strong className="font-mono">{formatTime(e.recorded_at, timezone, true)}</strong></>}.
        </p>
        {doubleTap && <p className="mt-2 text-sm text-ink-2">Probablemente es un doble toque: la siguiente vuelta aún no ha empezado. Si es así, no hagas nada.</p>}
        <button className="btn mt-4 w-full" onClick={onCancel} autoFocus>No registrar nada</button>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm underline">Reemplazar la hora registrada</summary>
          <form className="mt-3 space-y-2" onSubmit={(ev) => { ev.preventDefault(); onOverwrite(reason.trim()); }}>
            <label className="block">
              <span className="label">Motivo (queda en la auditoría)</span>
              <input className="field" value={reason} onChange={(ev) => setReason(ev.target.value)} required minLength={3} maxLength={500} />
            </label>
            <button className="btn btn-danger w-full" disabled={reason.trim().length < 3}>Reemplazar con la hora de ahora</button>
          </form>
        </details>
      </div>
    </div>
  );
}

function MissingLaps({ entries, yardOf, lapsOf, onOpen }: {
  entries: RosterEntry[]; yardOf: (distanceId: string) => number; lapsOf: (id: string) => number[]; onOpen: (id: string) => void;
}) {
  return (
    <section className="border-2 border-signal p-3">
      <h2 className="font-mono text-xs uppercase tracking-widest text-signal">Sin registro de una vuelta anterior ({entries.length})</h2>
      <p className="mt-1 text-sm text-paper/70">Si no completaron la vuelta a tiempo, márcalos DNF. Si sí la completaron, corrige su registro.</p>
      <ul className="mt-2 divide-y divide-paper/10">
        {entries.map((r) => {
          const laps = new Set(lapsOf(r.registration_id));
          const yard = yardOf(r.distance_id);
          const firstMissing = Array.from({ length: yard - 1 }, (_, i) => i + 1).find((n) => !laps.has(n));
          return (
            <li key={r.registration_id} className="flex items-center gap-3 py-2">
              <span className="font-mono font-bold">{r.bib ?? "—"}</span>
              <span className="flex-1 text-sm">{r.first_name} {r.last_name} · falta vuelta {firstMissing}</span>
              <button className="font-mono text-xs uppercase underline" onClick={() => onOpen(r.registration_id)}>Revisar</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const STATUS_CHOICES: ParticipationStatus[] = ["registered", "started", "dnf", "dns", "dsq", "finished"];

function RunnerSheet({ entry, events, timezone, checkpoints, onClose, onUndo, onToast }: {
  entry: RosterEntry; events: TimingEvent[]; timezone: string; checkpoints: { id: string; name: string }[];
  onClose: () => void; onUndo: (id: string) => void; onToast: (t: Omit<Toast, "id">) => void;
}) {
  const supabase = getBrowserClient();
  const [status, setStatus] = useState<ParticipationStatus>(entry.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const cp = new Map(checkpoints.map((c) => [c.id, c.name]));
  const needsReason = ["dns", "dnf", "dsq"].includes(status) || ["dns", "dnf", "dsq", "finished"].includes(entry.status);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc("set_participation_status", { p_registration_id: entry.registration_id, p_status: status, p_reason: reason.trim() || null });
    setSaving(false);
    if (error) return onToast({ ok: false, text: friendlyError(error) });
    onToast({ ok: true, text: `#${entry.bib ?? ""} ${entry.first_name}: ${PARTICIPATION_LABEL[status]}` });
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="runner-title" className="fixed inset-0 z-30 flex items-end bg-black/70 sm:items-center sm:justify-center" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto bg-paper p-5 text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="runner-title" className="display text-3xl">#{entry.bib ?? "—"} {entry.first_name} {entry.last_name}</h2>
          <button onClick={onClose} className="font-mono text-sm uppercase" aria-label="Cerrar">✕</button>
        </div>
        <p className="text-sm text-ink-2">{PARTICIPATION_LABEL[entry.status]}{entry.status_reason && ` · ${entry.status_reason}`}</p>

        <h3 className="eyebrow mb-1 mt-5">Registros</h3>
        {events.length === 0 ? <p className="text-sm text-ink-2">Sin registros.</p> : (
          <ul className="divide-y divide-line border-y border-ink text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-1.5">
                <span className="w-28">{KIND_LABEL[e.kind]}{e.lap_number ? ` ${e.lap_number}` : ""}{e.checkpoint_id ? ` · ${cp.get(e.checkpoint_id) ?? ""}` : ""}</span>
                <span className="font-mono tabular">{formatTime(e.recorded_at, timezone, true)}</span>
                <button className="ml-auto font-mono text-xs uppercase underline" onClick={() => { if (confirm("¿Anular este registro?")) onUndo(e.id); }}>Anular</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs"><Link className="underline" href={`/admin/cronometraje/registros?corredor=${entry.registration_id}`}>Corregir horas en Registros</Link></p>

        <form onSubmit={save} className="mt-5 space-y-3">
          <h3 className="eyebrow">Estado</h3>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value as ParticipationStatus)}>
            {STATUS_CHOICES.map((s) => <option key={s} value={s}>{PARTICIPATION_LABEL[s]}</option>)}
          </select>
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={needsReason ? "Motivo (obligatorio)" : "Motivo (opcional)"} required={needsReason && status !== entry.status} maxLength={500} />
          <button className="btn w-full" disabled={saving || status === entry.status}>{saving ? "Guardando…" : "Cambiar estado"}</button>
        </form>
      </div>
    </div>
  );
}
