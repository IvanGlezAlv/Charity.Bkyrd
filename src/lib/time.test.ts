import { describe, expect, it } from "vitest";
import { formatElapsed, fromLocalInputValue, toLocalInputValue, yardAt, zonedLocalToUtc } from "./time";

describe("zonedLocalToUtc", () => {
  it("converts Hermosillo wall clock (UTC-7, no DST)", () => {
    expect(zonedLocalToUtc("2026-11-28", "16:00", "America/Hermosillo")?.toISOString()).toBe("2026-11-28T23:00:00.000Z");
  });
  it("keeps milliseconds", () => {
    expect(zonedLocalToUtc("2026-11-28", "16:00:05.250", "America/Hermosillo")?.toISOString()).toBe("2026-11-28T23:00:05.250Z");
  });
  it("handles DST zones on both sides of a change", () => {
    expect(zonedLocalToUtc("2026-07-01", "12:00", "Europe/Madrid")?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-01", "12:00", "Europe/Madrid")?.toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });
  it("rejects times that do not exist", () => {
    expect(zonedLocalToUtc("2026-03-29", "02:30", "Europe/Madrid")).toBeNull();
    expect(zonedLocalToUtc("2026-02-30", "10:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("2026-11-28", "25:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("28/11/2026", "10:00", "UTC")).toBeNull();
  });
});

describe("datetime-local round trip", () => {
  it("round-trips through the race timezone", () => {
    const iso = "2026-11-28T23:00:00.000Z";
    const local = toLocalInputValue(iso, "America/Hermosillo");
    expect(local).toBe("2026-11-28T16:00");
    expect(fromLocalInputValue(local, "America/Hermosillo")).toBe(iso);
  });
});

describe("formatElapsed", () => {
  it("truncates to whole seconds", () => {
    expect(formatElapsed(3_723_999)).toBe("1:02:03");
    expect(formatElapsed(59_999)).toBe("0:00:59");
    expect(formatElapsed(null)).toBe("");
    expect(formatElapsed(-1)).toBe("");
  });
});

describe("yardAt", () => {
  const start = "2026-11-28T23:00:00.000Z";
  const t0 = new Date(start).getTime();
  it("reports the countdown before the start", () => {
    expect(yardAt(t0 - 5000, start, 60)).toMatchObject({ started: false, yard: 0, msToNext: 5000 });
  });
  it("moves to the next yard exactly at the bell", () => {
    expect(yardAt(t0, start, 60).yard).toBe(1);
    expect(yardAt(t0 + 3_599_999, start, 60).yard).toBe(1);
    expect(yardAt(t0 + 3_600_000, start, 60).yard).toBe(2);
    expect(yardAt(t0 + 90 * 60_000, start, 60)).toMatchObject({ yard: 2, msToNext: 30 * 60_000 });
  });
});
