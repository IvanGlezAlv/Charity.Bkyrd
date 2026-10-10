import type { ParticipationStatus, RosterEntry, TimingEvent } from "@/lib/types";

export const OUT_STATUSES: ParticipationStatus[] = ["dns", "dnf", "dsq", "finished"];

/** "12", "012" and "0012" all find bib "012"; non-numeric bibs match case-insensitively. */
export function findByBib<T extends { bib: string | null }>(roster: T[], input: string): T | undefined {
  const q = input.trim().toLowerCase();
  if (!q) return undefined;
  const exact = roster.find((r) => r.bib?.toLowerCase() === q);
  if (exact || !/^\d+$/.test(q)) return exact;
  const n = Number(q);
  return roster.find((r) => r.bib !== null && /^\d+$/.test(r.bib) && Number(r.bib) === n);
}

export function compareBibs(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = /^\d+$/.test(a) ? Number(a) : NaN;
  const nb = /^\d+$/.test(b) ? Number(b) : NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "es", { numeric: true });
}

export type YardState = "out" | "waiting" | "done" | "missing_previous";

/**
 * Backyard state of one runner during yard `yard` (1-based; 0 before the start):
 * done = this yard's lap is recorded; missing_previous = an earlier yard has
 * no lap, so the runner is probably out and needs a status decision.
 */
export function backyardState(entry: RosterEntry, laps: TimingEvent[], yard: number): YardState {
  if (OUT_STATUSES.includes(entry.status)) return "out";
  if (yard <= 0) return "waiting";
  const recorded = new Set(laps.map((l) => l.lap_number));
  if (recorded.has(yard)) return "done";
  for (let n = 1; n < yard; n++) if (!recorded.has(n)) return "missing_previous";
  return "waiting";
}

/** Active (non-voided) events grouped by registration, latest first. */
export function groupEvents(events: TimingEvent[]): Map<string, TimingEvent[]> {
  const map = new Map<string, TimingEvent[]>();
  for (const e of events) {
    if (e.voided_at) continue;
    const list = map.get(e.registration_id) ?? [];
    list.push(e);
    map.set(e.registration_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  return map;
}

/** Applies a Realtime change to the local event list. */
export function applyEventChange(events: TimingEvent[], row: TimingEvent): TimingEvent[] {
  const i = events.findIndex((e) => e.id === row.id);
  if (i === -1) return [...events, row];
  const next = events.slice();
  next[i] = row;
  return next;
}
