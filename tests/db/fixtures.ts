import type { TestDb } from "./harness";

export interface RaceFixture {
  raceId: string;
  distanceId: string;
  categories: Record<string, string>;
  regs: Record<string, string>; // bib -> registration id
}

/**
 * Creates a published race with one distance, two categories and the given
 * runners. Runs as the database owner (bypasses RLS), like a migration would.
 */
export async function createRace(
  db: TestDb,
  opts: {
    format: "backyard" | "fixed_distance";
    startMinutesAgo?: number;
    intervalMinutes?: number;
    runners: { bib: string; first: string; last: string; gender?: "F" | "M" | "X"; category?: "OPEN" | "MASTER" }[];
    published?: boolean;
  },
): Promise<RaceFixture> {
  const q = db.admin;
  const slug = `race-${Math.random().toString(36).slice(2, 8)}`;
  const { rows: [race] } = await q.query(
    `insert into public.races (slug, name, format, timezone, is_published)
     values ($1, 'Test race', $2, 'America/Hermosillo', $3) returning id`,
    [slug, opts.format, opts.published ?? true],
  );
  const { rows: [distance] } = await q.query(
    `insert into public.race_distances (race_id, slug, name, start_time, loop_interval_minutes)
     values ($1, 'main', 'Main', now() - make_interval(mins => $2), $3) returning id`,
    [race.id, opts.startMinutesAgo ?? 600, opts.format === "backyard" ? (opts.intervalMinutes ?? 60) : null],
  );
  const categories: Record<string, string> = {};
  for (const code of ["OPEN", "MASTER"]) {
    const { rows: [c] } = await q.query(
      `insert into public.race_categories (race_id, code, name) values ($1, $2, $2) returning id`,
      [race.id, code],
    );
    categories[code] = c.id;
  }
  const regs: Record<string, string> = {};
  for (const r of opts.runners) {
    const { rows: [p] } = await q.query(
      `insert into public.participants (race_id, first_name, last_name, gender, email, phone, internal_notes)
       values ($1, $2, $3, $4, $5, '555-0100', 'private note') returning id`,
      [race.id, r.first, r.last, r.gender ?? null, `${r.first.toLowerCase()}@example.com`],
    );
    const { rows: [reg] } = await q.query(
      `insert into public.registrations (race_id, participant_id, distance_id, category_id, bib)
       values ($1, $2, $3, $4, $5) returning id`,
      [race.id, p.id, distance.id, categories[r.category ?? "OPEN"], r.bib],
    );
    regs[r.bib] = reg.id;
  }
  return { raceId: race.id, distanceId: distance.id, categories, regs };
}
