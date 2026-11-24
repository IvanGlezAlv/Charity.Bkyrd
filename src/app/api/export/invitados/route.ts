import { NextResponse } from "next/server";
import { getSession, roleAllows } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CREW_EXPORT_HEADER, loadCrewSubmissions } from "@/lib/admin/crew";
import { formatDateTime } from "@/lib/time";
import { csvResponse, toCsv } from "@/lib/csv";

/** Access list for the caseta, one row per guest of every submission. Organizers only; RLS enforces the same. */
export async function GET() {
  const session = await getSession();
  if (!session || !roleAllows(session.roles, "organizer")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const race = await getActiveRace();
  if (!race) return NextResponse.json({ error: "Sin carrera" }, { status: 404 });
  const supabase = await createClient();
  const submissions = await loadCrewSubmissions(supabase, race.id);
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = submissions.flatMap((s, i) =>
    s.guests.map((g) => [
      g.name, g.repeated ? "Sí" : "", s.is_runner ? "Corredor" : "No corredor", s.bib, s.submitter,
      s.is_runner ? (s.bib_mismatch ? "No" : "Sí") : "", s.registered ? `${s.registered.bib ?? ""} ${s.registered.name}`.trim() : "", s.with_runner,
      g.position, s.cars, s.plates, formatDateTime(s.submitted_at, race.timezone), i + 1,
    ]),
  );
  return csvResponse(`invitados-${race.slug}-${stamp}.csv`, toCsv(CREW_EXPORT_HEADER, rows));
}
