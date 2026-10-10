"use client";

import { useEffect, useState } from "react";
import { formatClock, formatTime, yardAt } from "@/lib/time";

/**
 * Backyard clock. `serverOffsetMs` corrects the device clock against the
 * server so every phone at the finish line shows the same countdown.
 */
export function YardClock({ startIso, intervalMinutes, timezone, serverOffsetMs = 0, dark = false }: {
  startIso: string;
  intervalMinutes: number;
  timezone: string;
  serverOffsetMs?: number;
  dark?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() + serverOffsetMs);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [serverOffsetMs]);
  if (now === null) return <div className="h-16" aria-hidden />;
  const y = yardAt(now, startIso, intervalMinutes);
  const urgent = y.started && y.msToNext < 3 * 60_000;
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${dark ? "text-paper" : ""}`} aria-live="off">
      <div>
        <p className={`eyebrow ${dark ? "text-paper/60" : "text-ink-2"}`}>{y.started ? `Vuelta ${y.yard} en curso` : "Primera salida"}</p>
        <p className="font-mono text-sm tabular opacity-80">Hora oficial {formatTime(new Date(now).toISOString(), timezone, true)}</p>
      </div>
      <div className="text-right">
        <p className={`eyebrow ${dark ? "text-paper/60" : "text-ink-2"}`}>{y.started ? `Salida vuelta ${y.yard + 1} en` : "Faltan"}</p>
        <p className={`font-mono text-4xl font-bold tabular sm:text-5xl ${urgent ? "text-signal" : ""}`}>{formatClock(y.msToNext)}</p>
      </div>
    </div>
  );
}
