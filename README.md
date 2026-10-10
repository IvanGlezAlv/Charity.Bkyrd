# La Charity Bckyrd Ultra

Website and race-day timing for La Charity Bckyrd Ultra Vol. II: a backyard ultra with a 6.7 km loop every hour, first start Saturday 28 November 2026 at 4:00 PM (America/Hermosillo) at Las Riberas.

Registration is closed, so the site has no sign-up or payments. It publishes race information and live results, and gives the staff an admin for runners, timing and results.

## What's in it

| Area | Path | Who |
| --- | --- | --- |
| Public site: home, info, course with GPX map, manual, runners, live results | `/` | Everyone |
| Race-day summary | `/admin` | Staff |
| Timing screen (phone-friendly): bib entry, one tap per lap, double-tap guard, undo, DNF | `/admin/cronometraje` | Timer |
| Timing records: correct or void with a reason | `/admin/cronometraje/registros` | Timer |
| Runners: list, search, edit, status, bibs, CSV export | `/admin/participantes` | Organizer |
| Runner import from CSV, Excel or pasted spreadsheet, with preview | `/admin/participantes/importar` | Organizer |
| Results: review flags, publish provisional or official | `/admin/resultados` | Organizer, Admin for official |
| Race settings, GPX, site content, podcast, manual | `/admin/carrera`, `/admin/contenido`, `/admin/manual` | Organizer |

Roles: **admin** (everything), **organizer** (content, runners, provisional results), **timer** (timing and runner status). Every rule is enforced in the database with Row Level Security and security-definer functions, and checked again on the server.

The timing is manual: staff record each lap on the timing screen. There is no chip or GPS tracking. How laps become rankings is documented in [docs/TIMING.md](docs/TIMING.md).

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, Storage, Realtime), deployed on Vercel.

## Set up production

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Link it and apply the database migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```
3. In the SQL editor, run `supabase/race-setup.sql` once. It creates the race, the 6.7 km backyard distance with its 4:00 PM start, the venue and the podcast episodes. It adds no runners.
4. **Authentication → Providers → Email:** keep email sign-in on. **Authentication → Settings:** turn off "Allow new users to sign up". Staff accounts are created by you, never from the site.
5. **Authentication → URL Configuration:** set the Site URL to your production domain.

### 2. Vercel

1. Import the GitHub repository in Vercel.
2. Add these environment variables (values are under Supabase → Project Settings → API). See `.env.example`.

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key. Server only, never prefixed with `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_RACE_SLUG` | `charity-bkyrd-vol-ii` |
   | `NEXT_PUBLIC_SITE_URL` | your production URL |

3. Deploy.

### 3. Staff accounts

1. Supabase → **Authentication → Users → Add user**, with an email and password, and tick "Auto confirm".
2. In the SQL editor, give the role (use `admin`, `organizer` or `timer`):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
3. Sign in at `/login`.

### 4. Before race day

1. **Carrera y distancias:** upload the loop's GPX. The map, distance and elevation profile come from the file.
2. **Corredores → Importar:** paste or upload the runner list. Rows keep their order as sign-up order. Rows with errors are skipped and listed. Re-importing the same list does not duplicate people (matched by bib, reference, name with birth date, or name with email).
3. **Corredores → Asignar dorsales:** sign-up order, starting at 001.
4. Have each timer open `/admin/cronometraje` on their phone and check that it shows "En vivo" and "Reloj servidor".

## Local development

Requires Node 22 and Docker.

```bash
npm install
npx supabase start          # local Postgres, Auth, Realtime, Storage; applies migrations and seeds
cp .env.example .env.local  # fill in the values printed by `npx supabase status`
npm run dev
```

`supabase db reset` loads `supabase/race-setup.sql` and then `supabase/seed.sql`, which adds 12 **fake** runners for testing. Never run `seed.sql` in production. Create a local admin the same way as in production (step 3), using Supabase Studio or the Auth admin API.

## Tests

```bash
npm test                    # unit tests; database tests are skipped without TEST_DATABASE_URL
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
npm run lint && npm run typecheck && npm run build
```

The database tests create a throwaway database on any PostgreSQL 16+ server, load a small Supabase compatibility shim (`supabase/tests/shim.sql`) and every migration, then check RLS, timing, rankings, corrections, publication and imports as real users. CI runs all of this on every pull request.

## Privacy

Runner emails, phones, emergency contacts and medical notes are visible only to organizers and admins. Public pages read from views (`public_entrants`, `public_results`) that expose only bib, name, distance, category and results. Never commit runner data to this repository.
