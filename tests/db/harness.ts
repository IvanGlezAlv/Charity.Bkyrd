import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

/**
 * Database test harness. Creates a throwaway database on a plain PostgreSQL
 * server, applies the Supabase shim and every migration, and lets tests run
 * queries as anon / a signed-in user, the same way PostgREST does.
 *
 * Requires TEST_DATABASE_URL pointing at a server where the user may create
 * databases (e.g. postgres://postgres@localhost:5432/postgres).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = path.resolve(import.meta.dirname, "../..");

export interface TestDb {
  admin: Client;
  name: string;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `race_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const server = new Client({ connectionString: TEST_DATABASE_URL });
  await server.connect();
  await server.query(`create database ${name}`);
  await server.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query("set client_min_messages = error");
  await admin.query(readFileSync(path.join(root, "supabase/tests/shim.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(path.join(dir, file), "utf8"));
  }

  return {
    admin,
    name,
    close: async () => {
      await admin.end();
      const s = new Client({ connectionString: TEST_DATABASE_URL });
      await s.connect();
      await s.query(`drop database if exists ${name} with (force)`);
      await s.end();
    },
  };
}

/** Run `fn` inside a transaction as the given API role and user, then roll back unless `commit`. */
export async function asUser<T>(
  db: TestDb,
  user: { id: string } | null,
  fn: (q: Client["query"]) => Promise<T>,
  opts: { commit?: boolean } = {},
): Promise<T> {
  const c = db.admin;
  await c.query("begin");
  try {
    await c.query(`set local role ${user ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user?.id ?? ""]);
    await c.query("select set_config('request.jwt.claim.role', $1, true)", [user ? "authenticated" : "anon"]);
    // Each statement runs in a savepoint so a failing statement (e.g. an
    // expected permission error) does not abort the rest of the test.
    const query = (async (text: string, values?: unknown[]) => {
      await c.query("savepoint stmt");
      try {
        const res = await c.query(text, values);
        await c.query("release savepoint stmt");
        return res;
      } catch (err) {
        await c.query("rollback to savepoint stmt");
        throw err;
      }
    }) as unknown as Client["query"];
    const result = await fn(query);
    await c.query(opts.commit ? "commit" : "rollback");
    return result;
  } catch (err) {
    await c.query("rollback");
    throw err;
  }
}

export async function createUser(db: TestDb, email: string, roles: string[] = []) {
  const id = randomUUID();
  await db.admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  for (const role of roles) {
    await db.admin.query("insert into public.user_roles (user_id, role) values ($1, $2)", [id, role]);
  }
  return { id, email };
}
