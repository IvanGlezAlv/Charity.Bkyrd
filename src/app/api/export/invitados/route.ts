import { NextResponse } from "next/server";
import { getSession, roleAllows } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CREW_EXPORT_HEADER, loadCrewCars, loadCrewGuests } from "@/lib/admin/crew";
import { formatDateTime } from "@/lib/time";
import { csvResponse, toCsv } from "@/lib/csv";

/** Guest list for entry QR codes, one row per guest. Organizers only; RLS enforces the same. */
export async function GET() {
  const session = await getSession();
  if (!session || !roleAllows(session.roles, "organizer")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const race = await getActiveRace();
  if (!race) return NextResponse.json({ error: "Sin carrera" }, { status: 404 });
  const supabase = await createClient();
  const [rows, cars] = await Promise.all([loadCrewGuests(supabase, race.id), loadCrewCars(supabase, race.id)]);
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `invitados-${race.slug}-${stamp}.csv`,
    toCsv(CREW_EXPORT_HEADER, rows.map((r) => [r.bib, r.runner, r.guest, r.position, cars.get(r.registration_id)?.cars, cars.get(r.registration_id)?.plates, formatDateTime(r.submitted_at, race.timezone)])),
  );
}
