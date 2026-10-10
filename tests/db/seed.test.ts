import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, TEST_DATABASE_URL, type TestDb } from "./harness";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("development seed", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.admin.query(["race-setup.sql", "seed.sql"].map((f) => readFileSync(path.join(import.meta.dirname, "../../supabase", f), "utf8")).join("\n"));
  });
  afterAll(async () => {
    await db?.close();
  });

  it("publishes the race with its schedule and runners", async () => {
    const rows = await asUser(db, null, async (q) => ({
      race: (await q("select name, timezone from public.races where slug = 'charity-bkyrd-vol-ii'")).rows[0],
      start: (await q("select to_char(start_time at time zone 'America/Hermosillo', 'YYYY-MM-DD HH24:MI') as t, distance_km::float as km from public.race_distances")).rows[0],
      entrants: (await q("select bib from public.public_entrants order by bib")).rows.map((r) => r.bib),
    }));
    expect(rows.race).toEqual({ name: "La Charity Bckyrd Ultra Vol. II", timezone: "America/Hermosillo" });
    expect(rows.start).toEqual({ t: "2026-11-28 16:00", km: 6.7 });
    expect(rows.entrants[0]).toBe("001");
    expect(rows.entrants).toHaveLength(12);
  });
});
