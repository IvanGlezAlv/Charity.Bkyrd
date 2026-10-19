import { NextResponse } from "next/server";
import { getSession, roleAllows } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadRunnerProfiles } from "@/lib/admin/runner-profiles";
import { PROFILE_FIELDS } from "@/lib/runner-profile";
import { formatDateTime } from "@/lib/time";
import { csvResponse, toCsv } from "@/lib/csv";

/** Runner profiles for the livestream commentators. Organizers only; RLS enforces the same. */
export async function GET() {
  const session = await getSession();
  if (!session || !roleAllows(session.roles, "organizer")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const race = await getActiveRace();
  if (!race) return NextResponse.json({ error: "Sin carrera" }, { status: 404 });
  const rows = await loadRunnerProfiles(await createClient(), race.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `perfiles-${race.slug}-${stamp}.csv`,
    toCsv(
      ["Dorsal", "Corredor", ...PROFILE_FIELDS.map((f) => f.label.replace(/ \(opcional\)$/, "")), "Enviado"],
      rows.map((r) => [r.bib, r.runner, ...PROFILE_FIELDS.map((f) => r[f.name]), formatDateTime(r.updated_at, race.timezone)]),
    ),
  );
}
