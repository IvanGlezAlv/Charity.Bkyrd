/** Server clock for timing devices. Clients estimate their offset from it (see useServerOffset). */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
