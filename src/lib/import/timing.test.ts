import { describe, expect, it } from "vitest";
import { previewTiming, type TimingImportContext } from "./timing";

const ctx: TimingImportContext = {
  format: "backyard",
  timezone: "America/Hermosillo",
  eventDate: "2026-11-28",
  roster: [
    { registration_id: "r1", bib: "1", name: "Ana", distance_id: "d1", status: "started" },
    { registration_id: "r2", bib: "2", name: "Beto", distance_id: "d1", status: "dns" },
  ],
  checkpoints: [{ id: "c1", name: "Aguaje", distance_id: "d1" }],
};
const now = new Date("2026-11-29T12:00:00Z");

describe("previewTiming", () => {
  it("reads local wall-clock times in the race timezone and defaults to laps", () => {
    const p = previewTiming([["Dorsal", "Hora"], ["1", "16:52:31"]], ctx, now);
    expect(p.rows[0]).toMatchObject({ registration_id: "r1", kind: "lap", recorded_at: "2026-11-28T23:52:31.000Z", issues: [] });
  });

  it("accepts ISO timestamps with offsets and explicit laps", () => {
    const p = previewTiming([["bib", "time", "lap"], ["1", "2026-11-28T17:50:00-07:00", "2"]], ctx, now);
    expect(p.rows[0]).toMatchObject({ recorded_at: "2026-11-29T00:50:00.000Z", lap_number: 2 });
  });

  it("resolves checkpoints by name", () => {
    const p = previewTiming([["dorsal", "hora", "tipo", "punto"], ["1", "16:30", "punto", "aguaje"]], ctx, now);
    expect(p.rows[0]).toMatchObject({ kind: "checkpoint", checkpoint_id: "c1" });
  });

  it("rejects unknown bibs, DNS runners, bad times and finish events in backyard", () => {
    const p = previewTiming(
      [["dorsal", "hora", "tipo"], ["9", "16:00", ""], ["2", "16:10", ""], ["1", "25:61", ""], ["1", "17:00", "meta"]],
      ctx,
      now,
    );
    expect(p.rows.map((r) => r.issues.filter((i) => i.level === "error").length)).toEqual([1, 1, 1, 1]);
    expect(p.summary.valid).toBe(0);
  });

  it("flags duplicates and suspiciously close laps", () => {
    const p = previewTiming([["dorsal", "hora", "vuelta"], ["1", "16:50", "1"], ["1", "16:51", "1"], ["1", "16:52", ""]], ctx, now);
    expect(p.rows[1].issues.some((i) => i.message.includes("repetido"))).toBe(true);
    expect(p.rows[2].issues.some((i) => i.level === "warning")).toBe(true);
  });

  it("rejects future times and reports missing columns", () => {
    expect(previewTiming([["dorsal", "hora"], ["1", "2030-01-01T00:00:00Z"]], ctx, now).rows[0].issues[0].field).toBe("time");
    expect(previewTiming([["dorsal"], ["1"]], ctx, now).missingColumns).toEqual(["hora"]);
  });
});
