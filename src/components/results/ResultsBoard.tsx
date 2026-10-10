"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { PARTICIPATION_LABEL } from "@/lib/labels";
import { formatElapsed, formatTime } from "@/lib/time";
import type { Category, PublicResult, RaceFormat, ResultsPublication } from "@/lib/types";

type Conn = "connecting" | "live" | "offline";

interface Props {
  raceId: string;
  format: RaceFormat;
  timezone: string;
  publication: ResultsPublication;
  distances: { id: string; name: string; distance_km: number | null }[];
  categories: Category[];
  initialRows: PublicResult[];
  initialFetchedAt: string;
}

const POLL_MS = 20_000;

export function ResultsBoard(props: Props) {
  const { raceId, format, timezone, distances, categories } = props;
  const [rows, setRows] = useState(props.initialRows);
  const [fetchedAt, setFetchedAt] = useState(props.initialFetchedAt);
  const [conn, setConn] = useState<Conn>("connecting");
  const [loadError, setLoadError] = useState(false);
  const [distanceId, setDistanceId] = useState(distances[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [gender, setGender] = useState("");
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/results?race=${raceId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { rows: PublicResult[]; fetchedAt: string };
      setRows(body.rows);
      setFetchedAt(body.fetchedAt);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [raceId]);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refetch, 800);
  }, [refetch]);

  // Realtime: any change to this race's results triggers a debounced refetch.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`results-${raceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "race_results", filter: `race_id=eq.${raceId}` }, scheduleRefetch)
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setConn("live");
          scheduleRefetch(); // catch up on anything missed while disconnected
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConn("offline");
        }
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [raceId, scheduleRefetch]);

  // Fallback polling while Realtime is unavailable, and refresh on reconnect/focus.
  useEffect(() => {
    if (conn === "live") return;
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [conn, refetch]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refetch();
    window.addEventListener("online", refetch);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", refetch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  const publication = rows[0]?.results_publication ?? props.publication;
  const genders = useMemo(() => Array.from(new Set(rows.map((r) => r.gender).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => !distanceId || r.distance_id === distanceId)
      .filter((r) => !categoryId || r.category_id === categoryId)
      .filter((r) => !gender || r.gender === gender)
      .filter((r) => !q || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) || (r.bib ?? "").toLowerCase() === q.replace(/^#/, ""));
  }, [rows, distanceId, categoryId, gender, query]);

  const rankKey = categoryId ? "category_rank" : gender ? "gender_rank" : "overall_rank";
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ra = a[rankKey] ?? Number.MAX_SAFE_INTEGER;
        const rb = b[rankKey] ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        if (b.laps_completed !== a.laps_completed) return b.laps_completed - a.laps_completed;
        return (a.bib ?? "").localeCompare(b.bib ?? "", "es", { numeric: true });
      }),
    [filtered, rankKey],
  );

  return (
    <div>
      <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 border-2 p-3 ${publication === "official" ? "border-ink bg-ink text-paper" : "border-signal"}`}>
        <p className="font-mono text-sm font-bold uppercase tracking-wider">
          {publication === "official" ? "Resultados oficiales" : "Resultados provisionales · sujetos a revisión"}
        </p>
        <p className="eyebrow flex items-center gap-2" aria-live="polite">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${conn === "live" ? "bg-ok" : conn === "connecting" ? "bg-warn" : "bg-signal"}`} aria-hidden />
          {conn === "live" ? "En vivo" : conn === "connecting" ? "Conectando…" : "Reconectando (actualizando cada 20 s)"}
          <span className="opacity-70">· Actualizado {formatTime(fetchedAt, timezone, true)}</span>
        </p>
      </div>
      {loadError && <p role="alert" className="mb-4 border-2 border-signal p-3 text-signal">No se pudieron actualizar los resultados. Reintentando…</p>}

      {distances.length > 1 && (
        <div role="tablist" aria-label="Distancia" className="mb-4 flex flex-wrap gap-2">
          {distances.map((d) => (
            <button key={d.id} role="tab" aria-selected={distanceId === d.id} onClick={() => setDistanceId(d.id)}
              className={`btn ${distanceId === d.id ? "" : "btn-ghost"}`}>{d.name}</button>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label>
          <span className="label">Buscar por nombre o dorsal</span>
          <input className="field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. 23 o García" />
        </label>
        <label>
          <span className="label">Categoría</span>
          <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">General</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Rama</span>
          <select className="field" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Todas</option>
            {genders.map((g) => <option key={g} value={g}>{g === "F" ? "Femenil" : g === "M" ? "Varonil" : "No binario"}</option>)}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="border-2 border-dashed border-line p-10 text-center">
          <p className="display text-4xl">Aún no hay tiempos registrados.</p>
          <p className="mt-2 text-ink-2">Esta página se actualiza sola cuando el staff registre las primeras vueltas.</p>
        </div>
      ) : sorted.length === 0 ? (
        <p className="border-2 border-dashed border-line p-6 text-center text-ink-2">Ningún corredor coincide con la búsqueda.</p>
      ) : (
        <div className="overflow-x-auto border-y-2 border-ink">
          <table className="w-full min-w-[36rem] text-left">
            <caption className="sr-only">Clasificación</caption>
            <thead>
              <tr className="eyebrow border-b-2 border-ink">
                <th scope="col" className="py-2 pl-1 pr-3">{categoryId ? "Pos. cat." : gender ? "Pos. rama" : "Pos."}</th>
                <th scope="col" className="py-2 pr-3">Dorsal</th>
                <th scope="col" className="py-2 pr-3">Corredor</th>
                <th scope="col" className="hidden py-2 pr-3 sm:table-cell">Categoría</th>
                {format === "backyard" ? (
                  <>
                    <th scope="col" className="py-2 pr-3 text-right">Vueltas</th>
                    <th scope="col" className="hidden py-2 pr-3 text-right md:table-cell">Km</th>
                    <th scope="col" className="hidden py-2 pr-3 text-right sm:table-cell">Tiempo</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="py-2 pr-3 text-right">Tiempo</th>
                    <th scope="col" className="hidden py-2 pr-3 text-right md:table-cell">Llegada</th>
                  </>
                )}
                <th scope="col" className="py-2 pr-1 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <ResultRow key={r.registration_id} r={r} format={format} timezone={timezone} rankKey={rankKey}
                  loopKm={distances.find((d) => d.id === r.distance_id)?.distance_km ?? null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="eyebrow mt-4 text-ink-3">
        {format === "backyard"
          ? "Clasificación por vueltas completadas dentro de su hora. Empates comparten posición."
          : "Tiempos truncados al segundo. Empates comparten posición."}
      </p>
    </div>
  );
}

function ResultRow({ r, format, timezone, rankKey, loopKm }: { r: PublicResult; format: RaceFormat; timezone: string; rankKey: "overall_rank" | "category_rank" | "gender_rank"; loopKm: number | null }) {
  const [open, setOpen] = useState(false);
  const rank = r[rankKey];
  const laps = r.splits.filter((s) => s.type === "lap");
  return (
    <>
      <tr className="border-b border-line align-middle">
        <td className="display py-2 pl-1 pr-3 text-3xl tabular">{rank ?? "–"}</td>
        <td className="py-2 pr-3 font-mono tabular">{r.bib}</td>
        <td className="py-2 pr-3">
          <button className="text-left font-bold hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {r.first_name} {r.last_name}
          </button>
        </td>
        <td className="hidden py-2 pr-3 sm:table-cell">{r.category_name ?? ""}</td>
        {format === "backyard" ? (
          <>
            <td className="py-2 pr-3 text-right font-mono text-xl tabular">{r.laps_completed}</td>
            <td className="hidden py-2 pr-3 text-right font-mono tabular md:table-cell">
              {loopKm ? (r.laps_completed * Number(loopKm)).toLocaleString("es-MX", { maximumFractionDigits: 1 }) : ""}
            </td>
            <td className="hidden py-2 pr-3 text-right font-mono tabular sm:table-cell">{formatElapsed(r.gun_elapsed_ms)}</td>
          </>
        ) : (
          <>
            <td className="py-2 pr-3 text-right font-mono text-lg tabular">{formatElapsed(r.ranking_elapsed_s != null ? r.ranking_elapsed_s * 1000 : null)}</td>
            <td className="hidden py-2 pr-3 text-right font-mono tabular md:table-cell">{formatTime(r.finish_at, timezone, true)}</td>
          </>
        )}
        <td className="py-2 pr-1 text-right">
          <span className={`eyebrow ${r.status === "dnf" || r.status === "dsq" ? "text-signal" : r.status === "finished" ? "font-bold" : ""}`}>
            {r.status === "finished" && format === "backyard" ? "Last one standing" : PARTICIPATION_LABEL[r.status]}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-paper-2">
          <td colSpan={8} className="px-3 py-3">
            {r.splits.length === 0 ? (
              <p className="text-ink-2">Sin parciales registrados.</p>
            ) : (
              <ul className="flex flex-wrap gap-2 font-mono text-sm tabular">
                {(format === "backyard" ? laps : r.splits).map((s, i) => (
                  <li key={i} className={`border px-2 py-1 ${s.valid === false ? "border-signal text-signal" : "border-ink"}`}>
                    {s.type === "lap" ? `V${s.lap}` : s.name} · {s.type === "lap" && s.lap_ms != null ? formatElapsed(s.lap_ms) : formatElapsed(s.elapsed_ms)}
                    {s.valid === false && " · fuera de tiempo"}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
