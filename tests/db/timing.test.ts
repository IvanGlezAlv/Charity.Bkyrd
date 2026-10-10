import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, TEST_DATABASE_URL, type TestDb } from "./harness";
import { createRace } from "./fixtures";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("timing and results", () => {
  let db: TestDb;
  let admin: { id: string };
  let organizer: { id: string };
  let timer: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createUser(db, "admin@example.com", ["admin"]);
    organizer = await createUser(db, "org@example.com", ["organizer"]);
    timer = await createUser(db, "timer@example.com", ["timer"]);
  });

  afterAll(async () => {
    await db?.close();
  });

  /** Records an event as the timer, `minutesAfterStart` after the distance start. */
  async function record(
    raceId: string,
    regId: string,
    kind: string,
    minutesAfterStart: number | null,
    extra: { lap?: number; overwrite?: boolean; reason?: string; clientId?: string; checkpointId?: string } = {},
  ) {
    return asUser(
      db,
      timer,
      async (q) => {
        const { rows } = await q(
          `select public.record_timing_event(
             p_race_id => $1, p_registration_id => $2, p_kind => $3::public.timing_kind,
             p_lap_number => $4, p_checkpoint_id => $9,
             p_recorded_at => case when $5::numeric is null then null else
               (select d.start_time from public.registrations r join public.race_distances d on d.id = r.distance_id where r.id = $2)
               + make_interval(secs => $5::numeric * 60) end,
             p_overwrite => $6, p_reason => $7, p_client_event_id => $8) as res`,
          [raceId, regId, kind, extra.lap ?? null, minutesAfterStart, extra.overwrite ?? false, extra.reason ?? null,
           extra.clientId ?? null, extra.checkpointId ?? null],
        );
        return rows[0].res;
      },
      { commit: true },
    );
  }

  async function results(raceId: string) {
    const { rows } = await db.admin.query(
      `select reg.bib, rr.* from public.race_results rr join public.registrations reg on reg.id = rr.registration_id
       where rr.race_id = $1 order by reg.bib`,
      [raceId],
    );
    return Object.fromEntries(rows.map((r) => [r.bib, r]));
  }

  describe("backyard format", () => {
    it("counts consecutive valid laps and ranks by laps", async () => {
      const race = await createRace(db, {
        format: "backyard",
        startMinutesAgo: 400,
        runners: [
          { bib: "1", first: "A", last: "A", gender: "F" },
          { bib: "2", first: "B", last: "B", gender: "M" },
          { bib: "3", first: "C", last: "C", gender: "M" },
          { bib: "4", first: "D", last: "D", gender: "F" },
        ],
      });
      // Runner 1: laps 1-4 inside each hour. Runner 2: 1-3. Runner 3: 1-3. Runner 4: lap 1 late.
      for (const yard of [1, 2, 3, 4]) await record(race.raceId, race.regs["1"], "lap", (yard - 1) * 60 + 50);
      for (const yard of [1, 2, 3]) await record(race.raceId, race.regs["2"], "lap", (yard - 1) * 60 + 45);
      for (const yard of [1, 2, 3]) await record(race.raceId, race.regs["3"], "lap", (yard - 1) * 60 + 58);
      await record(race.raceId, race.regs["4"], "lap", 61, { lap: 1 });

      const r = await results(race.raceId);
      expect(r["1"].laps_completed).toBe(4);
      expect(r["2"].laps_completed).toBe(3);
      expect(r["3"].laps_completed).toBe(3);
      expect(r["4"].laps_completed).toBe(0);
      expect(r["1"].overall_rank).toBe(1);
      // Equal laps share the position (1, 2, 2).
      expect(r["2"].overall_rank).toBe(2);
      expect(r["3"].overall_rank).toBe(2);
      expect(r["4"].overall_rank).toBeNull();
      expect(r["4"].flags).toContain("late_lap:1");
      expect(r["1"].gender_rank).toBe(1);
      expect(r["2"].gender_rank).toBe(1);
      expect(Number(r["1"].gun_elapsed_ms)).toBe((3 * 60 + 50) * 60000);
      // Status moved from registered to started automatically.
      expect(r["1"].status).toBe("started");
    });

    it("blocks an accidental double tap within the same yard", async () => {
      const race = await createRace(db, { format: "backyard", startMinutesAgo: 30, runners: [{ bib: "7", first: "X", last: "X" }] });
      const first = await record(race.raceId, race.regs["7"], "lap", 25);
      expect(first.result).toBe("recorded");
      expect(first.event.lap_number).toBe(1);
      const second = await record(race.raceId, race.regs["7"], "lap", 26);
      expect(second.result).toBe("conflict");
      expect(second.reason).toBe("lap_already_recorded");
      expect((await results(race.raceId))["7"].laps_completed).toBe(1);
    });

    it("idempotent submissions return the original record", async () => {
      const race = await createRace(db, { format: "backyard", startMinutesAgo: 30, runners: [{ bib: "8", first: "Y", last: "Y" }] });
      const id = "6f1c3c9e-6a49-4d7b-9a43-0f3a6d1b2c11";
      const a = await record(race.raceId, race.regs["8"], "lap", 20, { clientId: id });
      const b = await record(race.raceId, race.regs["8"], "lap", 20, { clientId: id });
      expect(a.result).toBe("recorded");
      expect(b.result).toBe("duplicate");
      expect(b.event.id).toBe(a.event.id);
    });

    it("flags a missing lap record but does not mark the runner out", async () => {
      const race = await createRace(db, { format: "backyard", startMinutesAgo: 200, runners: [{ bib: "5", first: "M", last: "M" }] });
      await record(race.raceId, race.regs["5"], "lap", 50, { lap: 1 });
      await record(race.raceId, race.regs["5"], "lap", 170, { lap: 3 });
      const r = (await results(race.raceId))["5"];
      expect(r.laps_completed).toBe(1);
      expect(r.flags).toContain("missing_lap:2");
      expect(r.status).toBe("started");
    });

    it("ranks the last runner standing first", async () => {
      const race = await createRace(db, {
        format: "backyard",
        startMinutesAgo: 200,
        runners: [
          { bib: "1", first: "W", last: "W" },
          { bib: "2", first: "L", last: "L" },
        ],
      });
      for (const yard of [1, 2, 3]) await record(race.raceId, race.regs["1"], "lap", (yard - 1) * 60 + 40);
      for (const yard of [1, 2]) await record(race.raceId, race.regs["2"], "lap", (yard - 1) * 60 + 40);
      await asUser(db, timer, (q) => q("select public.set_participation_status($1, 'dnf', 'Did not start yard 3')", [race.regs["2"]]), { commit: true });
      await asUser(db, timer, (q) => q("select public.set_participation_status($1, 'finished', 'Last one standing')", [race.regs["1"]]), { commit: true });
      const r = await results(race.raceId);
      expect(r["1"].overall_rank).toBe(1);
      expect(r["1"].status).toBe("finished");
      expect(r["2"].overall_rank).toBe(2);
      expect(r["2"].status).toBe("dnf");
    });

    it("rejects finish events in a backyard race", async () => {
      const race = await createRace(db, { format: "backyard", runners: [{ bib: "1", first: "A", last: "A" }] });
      await expect(record(race.raceId, race.regs["1"], "finish", 10)).rejects.toThrow(/record laps/);
    });
  });

  describe("fixed-distance format", () => {
    it("computes elapsed time, ranks with ties and keeps DNF unranked", async () => {
      const race = await createRace(db, {
        format: "fixed_distance",
        startMinutesAgo: 300,
        runners: [
          { bib: "10", first: "A", last: "A", gender: "F", category: "OPEN" },
          { bib: "11", first: "B", last: "B", gender: "M", category: "MASTER" },
          { bib: "12", first: "C", last: "C", gender: "M", category: "MASTER" },
          { bib: "13", first: "D", last: "D", gender: "F", category: "OPEN" },
          { bib: "14", first: "E", last: "E", gender: "M", category: "OPEN" },
        ],
      });
      await record(race.raceId, race.regs["10"], "finish", 120);
      // 11 and 12 finish within the same second -> tie.
      await record(race.raceId, race.regs["11"], "finish", 130 + 0.1 / 60);
      await record(race.raceId, race.regs["12"], "finish", 130 + 0.9 / 60);
      await record(race.raceId, race.regs["13"], "finish", 140);
      await asUser(db, timer, (q) => q("select public.set_participation_status($1, 'dnf', 'Retired at aid station')", [race.regs["14"]]), { commit: true });

      const r = await results(race.raceId);
      expect(r["10"].status).toBe("finished");
      expect(Number(r["10"].gun_elapsed_ms)).toBe(120 * 60000);
      expect(Number(r["10"].ranking_elapsed_s)).toBe(7200);
      expect(r["10"].overall_rank).toBe(1);
      expect(r["11"].overall_rank).toBe(2);
      expect(r["12"].overall_rank).toBe(2);
      expect(r["13"].overall_rank).toBe(4);
      expect(r["14"].overall_rank).toBeNull();
      expect(r["11"].category_rank).toBe(1);
      expect(r["12"].category_rank).toBe(1);
      expect(r["13"].category_rank).toBe(2);
      expect(r["13"].gender_rank).toBe(2);
    });

    it("uses net time when configured and an individual start exists", async () => {
      const race = await createRace(db, {
        format: "fixed_distance",
        startMinutesAgo: 300,
        runners: [
          { bib: "1", first: "A", last: "A" },
          { bib: "2", first: "B", last: "B" },
        ],
      });
      await db.admin.query("update public.races set ranking_basis = 'net' where id = $1", [race.raceId]);
      await record(race.raceId, race.regs["1"], "start", 0);
      await record(race.raceId, race.regs["1"], "finish", 100);
      await record(race.raceId, race.regs["2"], "start", 10);
      await record(race.raceId, race.regs["2"], "finish", 105);
      const r = await results(race.raceId);
      expect(Number(r["2"].net_elapsed_ms)).toBe(95 * 60000);
      expect(Number(r["2"].gun_elapsed_ms)).toBe(105 * 60000);
      expect(r["2"].overall_rank).toBe(1);
      expect(r["1"].overall_rank).toBe(2);
    });

    it("asks before overwriting and requires a reason", async () => {
      const race = await createRace(db, { format: "fixed_distance", startMinutesAgo: 300, runners: [{ bib: "1", first: "A", last: "A" }] });
      await record(race.raceId, race.regs["1"], "finish", 100);
      const again = await record(race.raceId, race.regs["1"], "finish", 101);
      expect(again.result).toBe("conflict");
      expect(again.reason).toBe("exists");
      await expect(record(race.raceId, race.regs["1"], "finish", 101, { overwrite: true })).rejects.toThrow(/reason is required/);
      const fixed = await record(race.raceId, race.regs["1"], "finish", 99, { overwrite: true, reason: "Wrong bib keyed" });
      expect(fixed.result).toBe("recorded");
      expect(Number((await results(race.raceId))["1"].gun_elapsed_ms)).toBe(99 * 60000);

      const { rows: events } = await db.admin.query(
        "select voided_at, void_reason, replaced_by, recorded_by from public.timing_events where registration_id = $1 order by created_at",
        [race.regs["1"]],
      );
      expect(events).toHaveLength(2);
      expect(events[0].void_reason).toBe("Wrong bib keyed");
      expect(events[0].replaced_by).not.toBeNull();
      expect(events[1].recorded_by).toBe(timer.id);

      const { rows: audit } = await db.admin.query(
        "select actor_id, reason from public.audit_logs where table_name = 'timing_events' and reason = 'Wrong bib keyed'",
      );
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0].actor_id).toBe(timer.id);
    });

    it("corrections recalculate the ranking", async () => {
      const race = await createRace(db, {
        format: "fixed_distance",
        startMinutesAgo: 300,
        runners: [
          { bib: "1", first: "A", last: "A" },
          { bib: "2", first: "B", last: "B" },
        ],
      });
      const a = await record(race.raceId, race.regs["1"], "finish", 100);
      await record(race.raceId, race.regs["2"], "finish", 110);
      expect((await results(race.raceId))["1"].overall_rank).toBe(1);
      await asUser(
        db,
        timer,
        (q) =>
          q("select public.correct_timing_event($1, (select recorded_at + interval '20 minutes' from public.timing_events where id = $1), 'Clock offset')", [
            a.event.id,
          ]),
        { commit: true },
      );
      const r = await results(race.raceId);
      expect(r["2"].overall_rank).toBe(1);
      expect(r["1"].overall_rank).toBe(2);
    });

    it("never ranks a finish before the start", async () => {
      const race = await createRace(db, { format: "fixed_distance", startMinutesAgo: 60, runners: [{ bib: "1", first: "A", last: "A" }] });
      await record(race.raceId, race.regs["1"], "finish", -5);
      const r = (await results(race.raceId))["1"];
      expect(r.overall_rank).toBeNull();
      expect(r.gun_elapsed_ms).toBeNull();
      expect(r.flags).toContain("finish_before_start");
    });

    it("flags missing expected checkpoints without changing status", async () => {
      const race = await createRace(db, { format: "fixed_distance", startMinutesAgo: 300, runners: [{ bib: "1", first: "A", last: "A" }] });
      const { rows: [cp] } = await db.admin.query(
        "insert into public.course_checkpoints (race_id, distance_id, name, is_timed, sort_order) values ($1, $2, 'Aid 1', true, 1) returning id",
        [race.raceId, race.distanceId],
      );
      await record(race.raceId, race.regs["1"], "finish", 100);
      let r = (await results(race.raceId))["1"];
      expect(r.flags).toContain("missing_checkpoint:Aid 1");
      expect(r.status).toBe("finished");
      await record(race.raceId, race.regs["1"], "checkpoint", 50, { checkpointId: cp.id });
      r = (await results(race.raceId))["1"];
      expect(r.flags).not.toContain("missing_checkpoint:Aid 1");
      expect(r.splits.some((s: { name: string; elapsed_ms: number }) => s.name === "Aid 1" && s.elapsed_ms === 50 * 60000)).toBe(true);
    });
  });

  describe("publication", () => {
    it("official results freeze timing until an admin reopens them with a reason", async () => {
      const race = await createRace(db, { format: "fixed_distance", startMinutesAgo: 300, runners: [{ bib: "1", first: "A", last: "A" }] });
      await record(race.raceId, race.regs["1"], "finish", 100);
      await asUser(db, admin, (q) => q("select public.set_results_publication($1, 'official')", [race.raceId]), { commit: true });
      await expect(record(race.raceId, race.regs["1"], "finish", 90, { overwrite: true, reason: "late fix" })).rejects.toThrow(/official/);
      await expect(
        asUser(db, organizer, (q) => q("select public.set_results_publication($1, 'provisional', 'fix')", [race.raceId])),
      ).rejects.toThrow(/Only administrators/);
      await expect(
        asUser(db, admin, (q) => q("select public.set_results_publication($1, 'provisional')", [race.raceId])),
      ).rejects.toThrow(/reason is required/);
      await asUser(db, admin, (q) => q("select public.set_results_publication($1, 'provisional', 'Protest upheld for bib 1')", [race.raceId]), { commit: true });
      const res = await record(race.raceId, race.regs["1"], "finish", 90, { overwrite: true, reason: "Protest upheld" });
      expect(res.result).toBe("recorded");
    });
  });

  describe("imports", () => {
    it("imports timing rows atomically and skips duplicates", async () => {
      const race = await createRace(db, {
        format: "fixed_distance",
        startMinutesAgo: 300,
        runners: [
          { bib: "1", first: "A", last: "A" },
          { bib: "2", first: "B", last: "B" },
        ],
      });
      await record(race.raceId, race.regs["1"], "finish", 100);
      const { rows: [{ start }] } = await db.admin.query("select start_time as start from public.race_distances where id = $1", [race.distanceId]);
      const at = (m: number) => new Date(new Date(start).getTime() + m * 60000).toISOString();
      const res = await asUser(
        db,
        timer,
        async (q) =>
          (await q("select public.import_timing_events($1, $2::jsonb, 'skip') as res", [
            race.raceId,
            JSON.stringify([
              { registration_id: race.regs["1"], bib: "1", kind: "finish", recorded_at: at(101) },
              { registration_id: race.regs["2"], bib: "2", kind: "finish", recorded_at: at(120) },
            ]),
          ])).rows[0].res,
        { commit: true },
      );
      expect(res).toMatchObject({ recorded: 1, skipped: 1 });

      // A bad row rolls back the whole batch.
      const before = (await db.admin.query("select count(*)::int as n from public.timing_events where race_id = $1", [race.raceId])).rows[0].n;
      await expect(
        asUser(db, timer, (q) =>
          q("select public.import_timing_events($1, $2::jsonb, 'skip')", [
            race.raceId,
            JSON.stringify([
              { registration_id: race.regs["2"], bib: "2", kind: "start", recorded_at: at(0) },
              { registration_id: race.regs["2"], bib: "2", kind: "lap", recorded_at: at(10) },
            ]),
          ]),
          { commit: true },
        ),
      ).rejects.toThrow(/bib 2/);
      const after = (await db.admin.query("select count(*)::int as n from public.timing_events where race_id = $1", [race.raceId])).rows[0].n;
      expect(after).toBe(before);
    });

    it("imports participants with an explicit strategy", async () => {
      const race = await createRace(db, { format: "backyard", runners: [{ bib: "1", first: "Ana", last: "Uno" }] });
      const rows = [
        { first_name: "Ana", last_name: "Uno", bib: "1", distance_slug: "main", email: "new@example.com" },
        { first_name: "Beto", last_name: "Dos", bib: "2", distance_slug: "main", category_code: "MASTER" },
      ];
      const created = await asUser(
        db,
        organizer,
        async (q) => (await q("select public.import_participants($1, $2::jsonb, 'create_only') as r", [race.raceId, JSON.stringify(rows)])).rows[0].r,
        { commit: true },
      );
      expect(created).toEqual({ created: 1, updated: 0, skipped: 1 });
      const { rows: [ana] } = await db.admin.query("select email from public.participants where race_id = $1 and first_name = 'Ana'", [race.raceId]);
      expect(ana.email).toBe("ana@example.com");

      const updated = await asUser(
        db,
        organizer,
        async (q) => (await q("select public.import_participants($1, $2::jsonb, 'update_existing') as r", [race.raceId, JSON.stringify(rows)])).rows[0].r,
        { commit: true },
      );
      expect(updated).toEqual({ created: 0, updated: 2, skipped: 0 });
      const { rows: [ana2] } = await db.admin.query("select email from public.participants where race_id = $1 and first_name = 'Ana'", [race.raceId]);
      expect(ana2.email).toBe("new@example.com");

      await expect(
        asUser(db, organizer, (q) =>
          q("select public.import_participants($1, $2::jsonb, 'create_only')", [
            race.raceId,
            JSON.stringify([{ first_name: "Carla", last_name: "Tres", bib: "3", distance_slug: "nope" }]),
          ]),
        ),
      ).rejects.toThrow(/unknown distance/);

      await expect(
        asUser(db, timer, (q) => q("select public.import_participants($1, $2::jsonb)", [race.raceId, JSON.stringify(rows)])),
      ).rejects.toThrow(/Not authorized/);
    });
  });

  it("race overview counts come from the database", async () => {
    const race = await createRace(db, {
      format: "backyard",
      startMinutesAgo: 130,
      runners: [
        { bib: "1", first: "A", last: "A" },
        { bib: "2", first: "B", last: "B" },
        { bib: "3", first: "C", last: "C" },
      ],
    });
    await record(race.raceId, race.regs["1"], "lap", 40);
    await record(race.raceId, race.regs["1"], "lap", 100);
    await record(race.raceId, race.regs["2"], "lap", 40);
    await asUser(db, timer, (q) => q("select public.set_participation_status($1, 'dns', 'No show')", [race.regs["3"]]), { commit: true });
    const overview = await asUser(db, timer, async (q) => (await q("select public.race_overview($1) as o", [race.raceId])).rows[0].o);
    expect(overview[0]).toMatchObject({ registered: 3, starters: 2, dns: 1, on_course: 2 });
    // Yard 2 ended 10 minutes ago without a lap for runner 2: awaiting a record, not DNF.
    expect(overview[0].awaiting_lap_record).toBe(1);
    expect(overview[0].dnf).toBe(0);
  });
});
