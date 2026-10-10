"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countdownParts, formatClock, yardAt } from "@/lib/time";

const UNITS = [
  ["days", "Días"],
  ["hours", "Horas"],
  ["minutes", "Min"],
  ["seconds", "Seg"],
] as const;

/**
 * Countdown to the first start. Once the gun goes, a backyard race shows the
 * current yard and the time to the next start instead. Renders nothing on the
 * server so the ticking value never mismatches during hydration.
 */
export function RaceCountdown({ startIso, intervalMinutes }: { startIso: string; intervalMinutes: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startIso).getTime();
  if (now === null) return <div className="h-32 sm:h-36" aria-hidden />;

  if (now < start) {
    const parts = countdownParts(now, start);
    return (
      <div>
        <p className="eyebrow mb-2">Faltan para la salida</p>
        <dl className="grid grid-cols-4 border-2 border-ink" role="timer" aria-label={`Faltan ${parts.days} días, ${parts.hours} horas y ${parts.minutes} minutos`}>
          {UNITS.map(([key, label]) => (
            <div key={key} className="border-l-2 border-ink px-1.5 py-2 first:border-l-0 sm:p-4">
              <dd className="display text-3xl tabular sm:text-6xl lg:text-7xl">{String(parts[key]).padStart(2, "0")}</dd>
              <dt className="eyebrow mt-1 text-[0.6rem] text-ink-2 sm:text-xs">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  if (!intervalMinutes) {
    return <p className="eyebrow inline-flex border-2 border-ink px-3 py-2 text-signal">● Carrera en curso</p>;
  }
  const y = yardAt(now, startIso, intervalMinutes);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-2 border-ink p-4">
      <div>
        <p className="eyebrow text-signal">● Carrera en curso</p>
        <p className="display text-5xl sm:text-7xl">Vuelta {y.yard}</p>
      </div>
      <div className="text-right">
        <p className="eyebrow text-ink-2">Siguiente salida en</p>
        <p className="font-mono text-4xl font-bold tabular">{formatClock(y.msToNext)}</p>
        <Link href="/resultados" className="eyebrow underline">Resultados en vivo</Link>
      </div>
    </div>
  );
}
