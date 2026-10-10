import { NextResponse, type NextRequest } from "next/server";
import { getPublicResults } from "@/lib/results";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public results JSON for the live board (refetched when Realtime reports a change). */
export async function GET(request: NextRequest) {
  const raceId = request.nextUrl.searchParams.get("race") ?? "";
  if (!UUID.test(raceId)) return NextResponse.json({ error: "race inválido" }, { status: 400 });
  const { rows, error } = await getPublicResults(raceId);
  if (error) return NextResponse.json({ error: "No se pudieron cargar los resultados" }, { status: 502 });
  return NextResponse.json(
    { rows, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
