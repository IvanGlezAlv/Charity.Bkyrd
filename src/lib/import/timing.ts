import { zonedLocalToUtc } from "../time";
import { type Cell, cellToString, type Issue, mapHeaders, normalizeBib, normalizeKey } from "./common";
import type { RaceFormat, TimingKind } from "../types";

export const TIMING_FIELDS = {
  bib: ["dorsal", "numero", "bib", "bib number"],
  time: ["hora", "tiempo", "time", "timestamp", "fecha hora", "datetime", "recorded at"],
  date: ["fecha", "date", "dia"],
  kind: ["tipo", "evento", "type", "kind", "event"],
  lap: ["vuelta", "loop", "lap", "yarda", "yard"],
  checkpoint: ["punto", "punto de control", "checkpoint", "control", "cp"],
};

const KIND_SYNONYMS: Record<string, TimingKind> = {
  lap: "lap", vuelta: "lap", loop: "lap", yarda: "lap", yard: "lap",
  start: "start", salida: "start", inicio: "start",
  finish: "finish", meta: "finish", llegada: "finish", final: "finish",
  checkpoint: "checkpoint", punto: "checkpoint", control: "checkpoint", cp: "checkpoint", "punto de control": "checkpoint",
};

export interface TimingImportContext {
  format: RaceFormat;
  timezone: string;
  /** Race date (YYYY-MM-DD), used when the file only has wall-clock times. */
  eventDate: string | null;
  roster: { registration_id: string; bib: string | null; name: string; distance_id: string; status: string }[];
  checkpoints: { id: string; name: string; distance_id: string }[];
}

export interface TimingPreviewRow {
  line: number;
  bib: string;
  name: string | null;
  registration_id: string | null;
  kind: TimingKind | null;
  lap_number: number | null;
  checkpoint_id: string | null;
  recorded_at: string | null;
  issues: Issue[];
}

export interface TimingPreview {
  rows: TimingPreviewRow[];
  missingColumns: string[];
  unknownColumns: string[];
  summary: { total: number; valid: number; errors: number; warnings: number };
}

/**
 * Interprets a timing CSV. Times may be ISO 8601 with offset, or local wall
 * clock ("16:52:31", "2026-11-28 16:52:31") in the race timezone.
 */
export function previewTiming(sheet: Cell[][], ctx: TimingImportContext, now: Date = new Date()): TimingPreview {
  const [headerRow = [], ...body] = sheet;
  const { fields, unknown } = mapHeaders(headerRow, TIMING_FIELDS);
  const missingColumns = ["bib", "time"].filter((f) => !fields.includes(f)).map((f) => (f === "bib" ? "dorsal" : "hora"));
  const defaultKind: TimingKind = ctx.format === "backyard" ? "lap" : "finish";

  const rosterByBib = new Map(ctx.roster.filter((r) => r.bib).map((r) => [r.bib as string, r]));
  const rows: TimingPreviewRow[] = [];

  body.forEach((cells, i) => {
    if (!cells || cells.every((c) => cellToString(c) === "")) return;
    const get = (f: string) => {
      const idx = fields.indexOf(f);
      return idx === -1 ? undefined : cells[idx];
    };
    const issues: Issue[] = [];
    const bib = normalizeBib(get("bib"));
    const runner = bib ? rosterByBib.get(bib) : undefined;
    if (!bib) issues.push({ level: "error", field: "bib", message: "Falta el dorsal" });
    else if (!runner) issues.push({ level: "error", field: "bib", message: `Dorsal ${bib} no existe en la lista de corredores` });
    else if (runner.status === "dns" || runner.status === "dsq") {
      issues.push({ level: "error", field: "bib", message: `Dorsal ${bib} está marcado como ${runner.status.toUpperCase()}` });
    }

    const kindRaw = cellToString(get("kind"));
    let kind: TimingKind | null = kindRaw ? (KIND_SYNONYMS[normalizeKey(kindRaw)] ?? null) : defaultKind;
    if (!kind) issues.push({ level: "error", field: "kind", message: `Tipo desconocido: "${kindRaw}"` });
    if (kind && ctx.format === "backyard" && (kind === "start" || kind === "finish")) {
      issues.push({ level: "error", field: "kind", message: "En backyard solo se registran vueltas y puntos de control" });
      kind = null;
    }
    if (kind === "lap" && ctx.format !== "backyard") {
      issues.push({ level: "error", field: "kind", message: "Esta carrera no registra vueltas" });
      kind = null;
    }

    let lap: number | null = null;
    const lapRaw = cellToString(get("lap"));
    if (lapRaw) {
      lap = Number(lapRaw);
      if (!Number.isInteger(lap) || lap < 1) {
        issues.push({ level: "error", field: "lap", message: `Vuelta inválida: "${lapRaw}"` });
        lap = null;
      }
    }

    let checkpointId: string | null = null;
    const cpRaw = cellToString(get("checkpoint"));
    if (kind === "checkpoint") {
      const cp = ctx.checkpoints.find(
        (c) => normalizeKey(c.name) === normalizeKey(cpRaw) && (!runner || c.distance_id === runner.distance_id),
      );
      if (!cp) issues.push({ level: "error", field: "checkpoint", message: cpRaw ? `Punto de control desconocido: "${cpRaw}"` : "Falta el punto de control" });
      else checkpointId = cp.id;
    }

    let recordedAt: string | null = null;
    const timeCell = get("time");
    const timeRaw = cellToString(timeCell);
    if (timeCell instanceof Date) {
      recordedAt = timeCell.toISOString();
    } else if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(timeRaw) && !Number.isNaN(Date.parse(timeRaw))) {
      recordedAt = new Date(timeRaw).toISOString();
    } else if (timeRaw) {
      const m = /^(?:(\d{4}-\d{2}-\d{2})[T ])?(\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d{1,3})?)?)$/.exec(timeRaw);
      const date = m?.[1] ?? (cellToString(get("date")) || ctx.eventDate);
      if (m && date) recordedAt = zonedLocalToUtc(date, m[2], ctx.timezone)?.toISOString() ?? null;
      if (!recordedAt) issues.push({ level: "error", field: "time", message: `Hora inválida: "${timeRaw}"` });
    } else {
      issues.push({ level: "error", field: "time", message: "Falta la hora" });
    }
    if (recordedAt && new Date(recordedAt).getTime() > now.getTime() + 60_000) {
      issues.push({ level: "error", field: "time", message: "La hora está en el futuro" });
    }

    rows.push({
      line: i + 2,
      bib,
      name: runner?.name ?? null,
      registration_id: runner?.registration_id ?? null,
      kind,
      lap_number: kind === "lap" || kind === "checkpoint" ? lap : null,
      checkpoint_id: checkpointId,
      recorded_at: recordedAt,
      issues,
    });
  });

  // Same runner + passage twice in the file.
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.registration_id || !r.kind) continue;
    if (r.kind === "lap" && r.lap_number === null) continue;
    const key = `${r.registration_id}|${r.kind}|${r.lap_number ?? ""}|${r.checkpoint_id ?? ""}`;
    if (seen.has(key)) r.issues.push({ level: "error", message: `Registro repetido (ver fila ${seen.get(key)})` });
    else seen.set(key, r.line);
  }
  // Suspiciously close laps for the same runner (likely double entry).
  const byRunner = new Map<string, TimingPreviewRow[]>();
  for (const r of rows) {
    if (r.kind === "lap" && r.registration_id && r.recorded_at) {
      byRunner.set(r.registration_id, [...(byRunner.get(r.registration_id) ?? []), r]);
    }
  }
  for (const list of byRunner.values()) {
    list.sort((a, b) => a.recorded_at!.localeCompare(b.recorded_at!));
    for (let k = 1; k < list.length; k++) {
      const gap = new Date(list[k].recorded_at!).getTime() - new Date(list[k - 1].recorded_at!).getTime();
      if (gap < 10 * 60_000) {
        list[k].issues.push({ level: "warning", message: `Solo ${Math.round(gap / 1000)} s después de la fila ${list[k - 1].line}` });
      }
    }
  }

  const errors = rows.filter((r) => r.issues.some((x) => x.level === "error")).length;
  return {
    rows,
    missingColumns,
    unknownColumns: unknown,
    summary: {
      total: rows.length,
      valid: rows.length - errors,
      errors: errors + (missingColumns.length ? 1 : 0),
      warnings: rows.filter((r) => r.issues.some((x) => x.level === "warning")).length,
    },
  };
}
