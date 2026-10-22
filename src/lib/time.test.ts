import { describe, expect, it } from "vitest";
import { countdownParts, formatDay, formatElapsed, formatHour, fromLocalInputValue, toLocalInputValue, yardAt, zonedLocalToUtc } from "./time";

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

describe("countdownParts", () => {
  const start = Date.parse("2026-11-28T23:00:00Z"); // 4:00 PM in Hermosillo

  it("splits the time left into days, hours, minutes and seconds", () => {
    const now = start - (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000;
    expect(countdownParts(now, start)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("rounds partial seconds down", () => {
    expect(countdownParts(start - 1500, start)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it("is all zero at and after the start", () => {
    const zero = { days: 0, hours: 0, minutes: 0, seconds: 0 };
    expect(countdownParts(start, start)).toEqual(zero);
    expect(countdownParts(start + 60_000, start)).toEqual(zero);
  });
});

describe("formatHour", () => {
  it("uses the 12-hour clock of the poster and manual", () => {
    expect(formatHour("2026-11-28T23:00:00Z", "America/Hermosillo")).toBe("4:00 PM");
    expect(formatHour("2026-11-21T16:00:00Z", "America/Hermosillo")).toBe("9:00 AM");
    expect(formatHour("2026-11-29T07:00:00Z", "America/Hermosillo")).toBe("12:00 AM");
  });
});

describe("formatDay", () => {
  it("gives a short Spanish day label in the race timezone", () => {
    expect(formatDay("2026-11-21T16:00:00Z", "America/Hermosillo")).toBe("sáb 21 nov");
    // 23:30 local on Friday is already Saturday in UTC.
    expect(formatDay("2026-11-28T06:30:00Z", "America/Hermosillo")).toBe("vie 27 nov");
  });
});
