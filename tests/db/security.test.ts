import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, TEST_DATABASE_URL, type TestDb } from "./harness";
import { createRace, type RaceFixture } from "./fixtures";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("row level security", () => {
  let db: TestDb;
  let race: RaceFixture;
  let hidden: RaceFixture;
  let admin: { id: string };
  let organizer: { id: string };
  let timer: { id: string };
  let runnerAccount: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createUser(db, "admin@example.com", ["admin"]);
    organizer = await createUser(db, "org@example.com", ["organizer"]);
    timer = await createUser(db, "timer@example.com", ["timer"]);
    runnerAccount = await createUser(db, "someone@example.com");
    race = await createRace(db, {
      format: "fixed_distance",
      runners: [
        { bib: "1", first: "Ana", last: "Uno" },
        { bib: "2", first: "Beto", last: "Dos" },
      ],
    });
    hidden = await createRace(db, { format: "backyard", published: false, runners: [{ bib: "9", first: "Zoe", last: "Nueve" }] });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("anonymous visitors cannot read personal data or timing", async () => {
    await asUser(db, null, async (q) => {
      await expect(q("select * from public.participants")).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.registrations")).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.timing_events")).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.audit_logs")).rejects.toThrow(/permission denied/);
      await expect(q("select * from public.staff_roster")).rejects.toThrow(/permission denied/);
    });
  });

  it("public entrant list exposes only allow-listed columns of published races", async () => {
    const rows = await asUser(db, null, async (q) => (await q("select * from public.public_entrants")).rows);
    expect(rows.map((r) => r.bib).sort()).toEqual(["1", "2"]);
    const columns = Object.keys(rows[0]);
    for (const secret of ["email", "phone", "internal_notes", "medical_notes", "emergency_contact_phone", "birth_date"]) {
      expect(columns).not.toContain(secret);
    }
  });

  it("unpublished races are invisible to the public", async () => {
    const rows = await asUser(db, null, async (q) =>
      (await q("select id from public.races where id = $1", [hidden.raceId])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("results stay hidden until publication", async () => {
    const before = await asUser(db, null, async (q) =>
      (await q("select * from public.race_results where race_id = $1", [race.raceId])).rows,
    );
    expect(before).toHaveLength(0);
    await asUser(db, organizer, (q) => q("select public.set_results_publication($1, 'provisional')", [race.raceId]), { commit: true });
    const after = await asUser(db, null, async (q) =>
      (await q("select * from public.public_results where race_id = $1", [race.raceId])).rows,
    );
    expect(after).toHaveLength(2);
    expect(after[0].results_publication).toBe("provisional");
  });

  it("signed-in users without a role see nothing private", async () => {
    await asUser(db, runnerAccount, async (q) => {
      expect((await q("select * from public.participants")).rows).toHaveLength(0);
      expect((await q("select * from public.registrations")).rows).toHaveLength(0);
      expect((await q("select * from public.staff_roster")).rows).toHaveLength(0);
      await expect(
        q("select public.record_timing_event($1, $2, 'finish')", [race.raceId, race.regs["1"]]),
      ).rejects.toThrow(/Not authorized/);
    });
  });

  it("timers see the roster but not contact details", async () => {
    await asUser(db, timer, async (q) => {
      expect((await q("select * from public.participants")).rows).toHaveLength(0);
      const roster = (await q("select * from public.staff_roster where race_id = $1", [race.raceId])).rows;
      expect(roster).toHaveLength(2);
      expect(Object.keys(roster[0])).not.toContain("email");
    });
  });

  it("timers cannot edit content or participants", async () => {
    await asUser(db, timer, async (q) => {
      const res = await q("update public.races set name = 'hacked' where id = $1", [race.raceId]);
      expect(res.rowCount).toBe(0);
      await expect(
        q("insert into public.faqs (race_id, question, answer) values ($1, 'q', 'a')", [race.raceId]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("organizers manage participants and content", async () => {
    await asUser(db, organizer, async (q) => {
      expect((await q("select email from public.participants where race_id = $1", [race.raceId])).rows).toHaveLength(2);
      const res = await q("update public.races set tagline = 'Lord grant me vision' where id = $1", [race.raceId]);
      expect(res.rowCount).toBe(1);
    });
  });

  it("nobody writes timing_events or results directly", async () => {
    await asUser(db, admin, async (q) => {
      await expect(
        q(
          "insert into public.timing_events (race_id, registration_id, kind, recorded_at) values ($1, $2, 'finish', now())",
          [race.raceId, race.regs["1"]],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(q("delete from public.race_results")).rejects.toThrow(/permission denied/);
      await expect(q("delete from public.audit_logs")).rejects.toThrow(/permission denied/);
    });
  });

  it("users cannot grant themselves roles", async () => {
    await asUser(db, runnerAccount, async (q) => {
      await expect(
        q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [runnerAccount.id]),
      ).rejects.toThrow(/row-level security/);
    });
    await asUser(db, organizer, async (q) => {
      await expect(
        q("insert into public.user_roles (user_id, role) values ($1, 'admin')", [organizer.id]),
      ).rejects.toThrow(/row-level security/);
    });
    await asUser(db, admin, async (q) => {
      await expect(q("delete from public.user_roles where user_id = $1", [admin.id])).resolves.toMatchObject({ rowCount: 0 });
      await q("insert into public.user_roles (user_id, role) values ($1, 'timer')", [runnerAccount.id]);
    });
  });

  it("results publication can only change through the publication function", async () => {
    await asUser(db, admin, async (q) => {
      await expect(
        q("update public.races set results_publication = 'official' where id = $1", [race.raceId]),
      ).rejects.toThrow(/set_results_publication/);
    });
    await asUser(db, organizer, async (q) => {
      await expect(q("select public.set_results_publication($1, 'official')", [race.raceId])).rejects.toThrow(
        /Only administrators/,
      );
    });
  });

  it("internal recalculation is not callable through the API", async () => {
    await asUser(db, admin, async (q) => {
      await expect(q("select public.recalculate_results($1)", [race.raceId])).rejects.toThrow(/permission denied/);
    });
  });

  it("storage writes require an organizer", async () => {
    await asUser(db, timer, async (q) => {
      await expect(
        q("insert into storage.objects (bucket_id, name) values ('race-assets', 'x/gpx/a.gpx')"),
      ).rejects.toThrow(/row-level security/);
    });
    await asUser(db, organizer, async (q) => {
      await q("insert into storage.objects (bucket_id, name) values ('race-assets', 'x/gpx/a.gpx')");
    });
  });
});
