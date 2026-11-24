import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, TEST_DATABASE_URL, type TestDb } from "./harness";
import { createRace, type RaceFixture } from "./fixtures";

const d = TEST_DATABASE_URL ? describe : describe.skip;

const SUBMIT = "select public.submit_guest_list($1, $2, $3, $4, $5, $6, $7, $8) as n";

d("guest lists (/invitados)", () => {
  let db: TestDb;
  let race: RaceFixture;
  let organizer: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    organizer = await createUser(db, "org@example.com", ["organizer"]);
    race = await createRace(db, {
      format: "backyard",
      runners: [
        { bib: "007", first: "Ana", last: "Pérez" },
        { bib: "012", first: "Beto", last: "Ruiz" },
      ],
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("keeps every submission from the same runner", async () => {
    await asUser(db, null, async (q) => {
      await q(SUBMIT, [race.raceId, true, "7", "ana perez", null, ["Uno Uno", "Dos Dos"], 1, "ABC-123"]);
      await q(SUBMIT, [race.raceId, true, "007", "Ana", null, ["Tres Tres"], 0, ""]);
      // The deployed site's older entry point appends as well.
      await q("select public.submit_crew($1, '7', 'Ana', array['Cuatro Cuatro'], 2, null)", [race.raceId]);
    }, { commit: true });
    const rows = await asUser(db, organizer, async (q) => (await q(
      `select s.registration_id, s.cars, array_agg(g.full_name order by g.position) guests
       from public.crew_submissions s join public.crew_submission_guests g on g.submission_id = s.id
       where s.race_id = $1 group by s.id order by s.submitted_at, s.cars`, [race.raceId])).rows);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.registration_id === race.regs["007"])).toBe(true);
    expect(rows.map((r) => r.guests).flat().sort()).toEqual(["Cuatro Cuatro", "Dos Dos", "Tres Tres", "Uno Uno"]);
  });

  it("accepts up to 30 guests and rejects more", async () => {
    const guests = (n: number) => Array.from({ length: n }, (_, i) => `Invitado ${i + 1}`);
    await asUser(db, null, async (q) => {
      expect((await q(SUBMIT, [race.raceId, true, "12", "Beto", null, guests(30), 3, null])).rows[0].n).toBe(30);
      await expect(q(SUBMIT, [race.raceId, true, "12", "Beto", null, guests(31), 3, null])).rejects.toThrow(/Too many guests/);
    });
  });

  it("lets people who are not running submit with their own name", async () => {
    await asUser(db, null, async (q) => {
      expect((await q(SUBMIT, [race.raceId, false, null, "Carla Gómez", "Ana Pérez", ["Diego Gómez"], 1, null])).rows[0].n).toBe(1);
      await expect(q(SUBMIT, [race.raceId, false, null, "C", null, ["Diego Gómez"], 0, null])).rejects.toThrow(/Invalid name/);
    }, { commit: true });
    const row = await asUser(db, organizer, async (q) => (await q(
      "select registration_id, submitter_name, with_runner from public.crew_submissions where submitter_name = 'Carla Gómez'")).rows[0]);
    expect(row).toEqual({ registration_id: null, submitter_name: "Carla Gómez", with_runner: "Ana Pérez" });
  });

  it("saves runner lists whose bib + name don't match and flags them", async () => {
    await asUser(db, null, async (q) => {
      expect((await q(SUBMIT, [race.raceId, true, "45", "Beto Ruiz", null, ["Mismo Bib"], 1, null])).rows[0].n).toBe(1);
    }, { commit: true });
    const row = await asUser(db, organizer, async (q) => (await q(
      "select registration_id, is_runner, typed_bib, submitter_name from public.crew_submissions where typed_bib = '45'")).rows[0]);
    expect(row).toEqual({ registration_id: null, is_runner: true, typed_bib: "45", submitter_name: "Beto Ruiz" });
    const matched = await asUser(db, organizer, async (q) => (await q(
      "select count(*)::int n from public.crew_submissions where registration_id = $1 and is_runner and typed_bib = '7'", [race.regs["007"]])).rows[0].n);
    expect(matched).toBe(2);
  });

  it("keeps guest lists private and blocks the old overwrite path", async () => {
    await asUser(db, null, async (q) => {
      await expect(q("select * from public.crew_submissions")).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.crew_submission_guests")).rejects.toThrow(/permission denied/);
      await expect(q("select public.submit_crew_guests($1, '7', 'Ana', array['Zeta Zeta'])", [race.raceId])).rejects.toThrow(/permission denied/);
    });
  });

  it("backfill rebuilds overwritten lists from the audit log", async () => {
    const legacy = await createTestDb();
    try {
      // Re-run the migration on a database whose history came from the old functions.
      const r = await createRace(legacy, { format: "backyard", runners: [{ bib: "033", first: "Juan", last: "Mendoza" }] });
      const q = legacy.admin;
      await q.query("truncate public.crew_submission_guests, public.crew_submissions");
      await q.query("drop table public.crew_submission_guests, public.crew_submissions cascade");
      await q.query("grant execute on function public.submit_crew_guests(uuid, text, text, text[]) to anon");
      await q.query("select public.submit_crew_guests($1, '33', 'Juan', array['Uno Uno', 'Dos Dos'])", [r.raceId]);
      await q.query(`insert into public.crew_cars (registration_id, race_id, cars, plates) values ($1, $2, 1, 'AAA')`, [r.regs["033"], r.raceId]);
      await q.query("select public.submit_crew_guests($1, '33', 'Juan', array['Tres Tres'])", [r.raceId]);
      const sql = readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261124000100_crew_submissions.sql"), "utf8");
      await q.query(sql);
      const { rows } = await q.query(
        `select s.cars, s.plates, array_agg(g.full_name order by g.position) guests
         from public.crew_submissions s join public.crew_submission_guests g on g.submission_id = s.id
         group by s.id order by s.submitted_at`);
      expect(rows.map((x) => x.guests)).toEqual([["Uno Uno", "Dos Dos"], ["Tres Tres"]]);
    } finally {
      await legacy.close();
    }
  });
});
