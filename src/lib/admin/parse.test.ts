import { describe, expect, it } from "vitest";
import { parseFields } from "./parse";
import { COLLECTIONS, RACE_FIELDS } from "./collections";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseFields", () => {
  it("converts datetimes from the race timezone and numbers", () => {
    const { values, errors } = parseFields(
      COLLECTIONS.distances.fields,
      fd({ name: "Backyard", slug: "backyard", distance_km: "6,7", start_time: "2026-11-28T16:00", loop_interval_minutes: "60", is_published: "on" }),
      "America/Hermosillo",
    );
    expect(errors).toEqual({});
    expect(values).toMatchObject({ distance_km: 6.7, start_time: "2026-11-28T23:00:00.000Z", loop_interval_minutes: 60, is_published: true, sort_order: null });
  });

  it("reports required, range, slug and option errors", () => {
    const { errors } = parseFields(
      COLLECTIONS.distances.fields,
      fd({ name: "", slug: "Back Yard", distance_km: "-1", loop_interval_minutes: "1.5" }),
      "UTC",
    );
    expect(Object.keys(errors).sort()).toEqual(["distance_km", "loop_interval_minutes", "name", "slug"]);
    expect(parseFields(COLLECTIONS.contacts.fields, fd({ name: "x", kind: "boss" }), "UTC").errors.kind).toBeTruthy();
  });

  it("only accepts references from the allowed set", () => {
    const fields = COLLECTIONS.checkpoints.fields;
    const ok = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    const base = { name: "Aguaje", kind: "aid_station" };
    expect(parseFields(fields, fd({ ...base, distance_id: ok }), "UTC", { distances: new Set([ok]) }).errors).toEqual({});
    expect(parseFields(fields, fd({ ...base, distance_id: other }), "UTC", { distances: new Set([ok]) }).errors.distance_id).toBeTruthy();
  });

  it("parses social links and rejects non-http URLs", () => {
    const good = parseFields(RACE_FIELDS, fd({ name: "x", timezone: "UTC", format: "backyard", event_status: "upcoming", registration_note: "Cerradas", ranking_basis: "gun", social_links: "Instagram | https://www.instagram.com/charitybkyrd/" }), "UTC");
    expect(good.values.social_links).toEqual([{ label: "Instagram", url: "https://www.instagram.com/charitybkyrd/" }]);
    const bad = parseFields(RACE_FIELDS, fd({ social_links: "X | javascript:alert(1)" }), "UTC");
    expect(bad.errors.social_links).toBeTruthy();
    expect(parseFields(COLLECTIONS.sponsors.fields, fd({ name: "a", website_url: "javascript:alert(1)" }), "UTC").errors.website_url).toBeTruthy();
  });
});
