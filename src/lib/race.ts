import type { Distance, Race } from "./types";

/** Earliest official start among the race's distances. */
export function firstStart(distances: Distance[]): string | null {
  const starts = distances.map((d) => d.start_time).filter((s): s is string => Boolean(s)).sort();
  return starts[0] ?? null;
}

export function distanceSummary(race: Race, d: Distance): string {
  const parts: string[] = [];
  if (d.distance_km) parts.push(`${Number(d.distance_km).toLocaleString("es-MX")} km${race.format === "backyard" ? " por vuelta" : ""}`);
  if (race.format === "backyard") parts.push(`cada ${d.loop_interval_minutes ?? 60} min`);
  if (d.elevation_gain_m != null) parts.push(`+${d.elevation_gain_m} m`);
  return parts.join(" · ");
}
