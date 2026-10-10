"use client";

import { useEffect, useState } from "react";

export interface ClockSync {
  /** serverTime ≈ Date.now() + offsetMs */
  offsetMs: number;
  /** Round trip of the best sample; the offset is accurate to about half of it. */
  rttMs: number;
  syncedAt: number;
}

/** Offset from the sample with the shortest round trip (NTP-style midpoint estimate). */
export function bestOffset(samples: { t0: number; server: number; t1: number }[]): ClockSync | null {
  if (samples.length === 0) return null;
  const best = samples.reduce((a, b) => (b.t1 - b.t0 < a.t1 - a.t0 ? b : a));
  return { offsetMs: Math.round(best.server - (best.t0 + best.t1) / 2), rttMs: best.t1 - best.t0, syncedAt: best.t1 };
}

async function sample() {
  const t0 = Date.now();
  const res = await fetch("/api/time", { cache: "no-store" });
  const { now } = (await res.json()) as { now: number };
  return { t0, server: now, t1: Date.now() };
}

/** Measures the device clock against the server every few minutes. */
export function useServerClock(intervalMs = 5 * 60_000) {
  const [sync, setSync] = useState<ClockSync | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const samples = [];
      for (let i = 0; i < 4; i++) {
        try {
          samples.push(await sample());
        } catch {
          /* try the next sample */
        }
      }
      if (cancelled) return;
      const s = bestOffset(samples);
      setFailed(!s);
      if (s) setSync(s);
    };
    run();
    const id = setInterval(run, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return { sync, failed };
}
