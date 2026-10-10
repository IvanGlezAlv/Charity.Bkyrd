import { describe, expect, it } from "vitest";
import type { RosterEntry, TimingEvent } from "@/lib/types";
import { applyEventChange, backyardState, compareBibs, findByBib, groupEvents } from "./console";

const entry = (status: RosterEntry["status"] = "started"): RosterEntry => ({
  registration_id: "r1", race_id: "x", bib: "007", first_name: "A", last_name: "B", gender: null,
  distance_id: "d", distance_name: "D", category_id: null, category_name: null, status, status_reason: null,
});
const lap = (n: number, extra: Partial<TimingEvent> = {}): TimingEvent => ({
  id: `e${n}`, race_id: "x", registration_id: "r1", kind: "lap", lap_number: n, checkpoint_id: null,
  recorded_at: `2026-11-28T23:${String(n).padStart(2, "0")}:00Z`, source: "manual", note: null, recorded_by: null,
  created_at: "", voided_at: null, voided_by: null, void_reason: null, replaced_by: null, ...extra,
});

describe("timing console helpers", () => {
  it("finds bibs with or without leading zeros", () => {
    const roster = [{ bib: "007" }, { bib: "12" }, { bib: "A-3" }, { bib: null }];
    expect(findByBib(roster, "7")?.bib).toBe("007");
    expect(findByBib(roster, "012")?.bib).toBe("12");
    expect(findByBib(roster, "a-3")?.bib).toBe("A-3");
    expect(findByBib(roster, "99")).toBeUndefined();
  });
  it("sorts bibs numerically", () => {
    expect(["010", "9", null, "001"].sort(compareBibs)).toEqual(["001", "9", "010", null]);
  });
  it("derives the backyard state of a runner", () => {
    expect(backyardState(entry(), [], 0)).toBe("waiting");
    expect(backyardState(entry(), [lap(1)], 1)).toBe("done");
    expect(backyardState(entry(), [lap(1)], 2)).toBe("waiting");
    expect(backyardState(entry(), [lap(1)], 3)).toBe("missing_previous");
    expect(backyardState(entry("dnf"), [], 3)).toBe("out");
  });
  it("ignores voided events and applies realtime updates", () => {
    const events = [lap(1), lap(2, { voided_at: "now" })];
    expect(groupEvents(events).get("r1")?.map((e) => e.lap_number)).toEqual([1]);
    const updated = applyEventChange(events, lap(1, { voided_at: "now" }));
    expect(groupEvents(updated).get("r1")).toBeUndefined();
    expect(applyEventChange(events, lap(3))).toHaveLength(3);
  });
});
