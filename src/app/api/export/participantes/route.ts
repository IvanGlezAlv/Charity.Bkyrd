import { NextResponse } from "next/server";
import { getSession, roleAllows } from "@/lib/auth";
import { getActiveRace, getCategories, getDistances } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { EXPORT_HEADER, exportRows, loadEntries } from "@/lib/admin/participants";
import { csvResponse, toCsv } from "@/lib/csv";

/** Full runner list with contact and medical data. Organizers only; RLS enforces the same. */
export async function GET() {
  const session = await getSession();
  if (!session || !roleAllows(session.roles, "organizer")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const race = await getActiveRace();
  if (!race) return NextResponse.json({ error: "Sin carrera" }, { status: 404 });
  const supabase = await createClient();
  const [entries, distances, categories] = await Promise.all([
    loadEntries(supabase, race.id),
    getDistances(race.id),
    getCategories(race.id),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`corredores-${race.slug}-${stamp}.csv`, toCsv(EXPORT_HEADER, exportRows(entries, distances, categories)));
}
