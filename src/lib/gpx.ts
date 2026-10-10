import { XMLParser } from "fast-xml-parser";
import type { ElevationPoint, GpxStats } from "./types";

/**
 * GPX parsing. Everything here is derived from the uploaded file: if the file
 * has no elevation, no elevation is reported; nothing is interpolated or
 * invented.
 */

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number | null;
}

export interface ParsedGpx {
  points: TrackPoint[];
  stats: GpxStats;
  route: { type: "LineString"; coordinates: [number, number][] };
  profile: ElevationPoint[] | null;
}

export class GpxError extends Error {}

const MAX_ROUTE_POINTS = 2000;
const MAX_PROFILE_POINTS = 400;
/** Elevation changes smaller than this are treated as GPS noise when totalling gain/loss. */
export const ELEVATION_NOISE_THRESHOLD_M = 3;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

type RawPoint = { "@_lat"?: string; "@_lon"?: string; ele?: string | number };

function toPoint(p: RawPoint): TrackPoint | null {
  const lat = Number(p["@_lat"]);
  const lon = Number(p["@_lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const eleRaw = p.ele;
  const ele = eleRaw === undefined || eleRaw === "" ? null : Number(eleRaw);
  return { lat, lon, ele: ele !== null && Number.isFinite(ele) ? ele : null };
}

export function haversineKm(a: TrackPoint, b: TrackPoint): number {
  const R = 6371.0088;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

export function parseGpx(xml: string): ParsedGpx {
  if (!/<gpx[\s>]/i.test(xml)) throw new GpxError("El archivo no es un GPX válido.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new GpxError("El GPX contiene declaraciones no permitidas.");

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new GpxError("No se pudo leer el GPX.");
  }
  const gpx = (doc.gpx ?? {}) as Record<string, unknown>;

  const raw: RawPoint[] = [];
  for (const trk of asArray(gpx.trk as Record<string, unknown> | Record<string, unknown>[])) {
    for (const seg of asArray(trk.trkseg as Record<string, unknown> | Record<string, unknown>[])) {
      raw.push(...asArray(seg.trkpt as RawPoint | RawPoint[]));
    }
  }
  if (raw.length === 0) {
    for (const rte of asArray(gpx.rte as Record<string, unknown> | Record<string, unknown>[])) {
      raw.push(...asArray(rte.rtept as RawPoint | RawPoint[]));
    }
  }
  const points = raw.map(toPoint).filter((p): p is TrackPoint => p !== null);
  if (points.length < 2) throw new GpxError("El GPX no contiene un track o ruta con puntos.");

  let distance = 0;
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distance += haversineKm(points[i - 1], points[i]);
    cumulative.push(distance);
  }

  const withEle = points.filter((p) => p.ele !== null);
  const hasElevation = withEle.length >= points.length * 0.9;
  let gain = 0;
  let loss = 0;
  let minEle: number | null = null;
  let maxEle: number | null = null;
  if (hasElevation) {
    let ref: number | null = null;
    for (const p of points) {
      if (p.ele === null) continue;
      minEle = minEle === null ? p.ele : Math.min(minEle, p.ele);
      maxEle = maxEle === null ? p.ele : Math.max(maxEle, p.ele);
      if (ref === null) {
        ref = p.ele;
        continue;
      }
      const diff = p.ele - ref;
      if (Math.abs(diff) >= ELEVATION_NOISE_THRESHOLD_M) {
        if (diff > 0) gain += diff;
        else loss -= diff;
        ref = p.ele;
      }
    }
  }

  const profile = hasElevation
    ? sample(
        points.map((p, i) => ({ d: Number(cumulative[i].toFixed(3)), e: p.ele })).filter((x): x is ElevationPoint => x.e !== null),
        MAX_PROFILE_POINTS,
      ).map((x) => ({ d: x.d, e: Math.round(x.e * 10) / 10 }))
    : null;

  const route = {
    type: "LineString" as const,
    coordinates: sample(points, MAX_ROUTE_POINTS).map((p) => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))] as [number, number]),
  };

  return {
    points,
    route,
    profile,
    stats: {
      distance_km: Number(distance.toFixed(2)),
      gain_m: Math.round(gain),
      loss_m: Math.round(loss),
      min_ele_m: minEle === null ? null : Math.round(minEle),
      max_ele_m: maxEle === null ? null : Math.round(maxEle),
      points: points.length,
      has_elevation: hasElevation,
    },
  };
}
