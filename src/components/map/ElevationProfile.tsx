import type { ElevationPoint } from "@/lib/types";

/** Elevation profile drawn from GPX points (server-rendered SVG). */
export function ElevationProfile({ points, checkpoints = [] }: { points: ElevationPoint[]; checkpoints?: { km: number; name: string }[] }) {
  if (points.length < 2) return null;
  const W = 800;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const maxD = points[points.length - 1].d || 1;
  const eles = points.map((p) => p.e);
  const minE = Math.min(...eles);
  const maxE = Math.max(...eles);
  const span = Math.max(maxE - minE, 20);
  const lo = Math.floor((minE - span * 0.1) / 10) * 10;
  const hi = Math.ceil((maxE + span * 0.1) / 10) * 10;
  const x = (d: number) => pad.l + (d / maxD) * (W - pad.l - pad.r);
  const y = (e: number) => pad.t + (1 - (e - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`).join("");
  const area = `${line}L${x(maxD).toFixed(1)},${H - pad.b}L${x(0).toFixed(1)},${H - pad.b}Z`;
  const kmStep = maxD > 20 ? 5 : maxD > 8 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(maxD / kmStep) + 1 }, (_, i) => i * kmStep);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Perfil de elevación: de ${Math.round(minE)} a ${Math.round(maxE)} metros en ${maxD.toFixed(1)} km`}>
        <path d={area} fill="#121110" fillOpacity={0.12} />
        <path d={line} fill="none" stroke="#121110" strokeWidth={2} />
        {[lo, (lo + hi) / 2, hi].map((e) => (
          <g key={e}>
            <line x1={pad.l} x2={W - pad.r} y1={y(e)} y2={y(e)} stroke="#c9c2b2" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={y(e) + 4} textAnchor="end" fontSize="11" fontFamily="var(--font-mono)" fill="#3d3a35">{Math.round(e)}</text>
          </g>
        ))}
        {ticks.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="#3d3a35">{d} km</text>
        ))}
        {checkpoints.filter((c) => c.km <= maxD).map((c) => (
          <g key={c.name}>
            <line x1={x(c.km)} x2={x(c.km)} y1={pad.t} y2={H - pad.b} stroke="#c4241b" strokeWidth={1.5} />
            <text x={x(c.km) + 4} y={pad.t + 10} fontSize="11" fontFamily="var(--font-mono)" fill="#c4241b">{c.name}</text>
          </g>
        ))}
      </svg>
      <figcaption className="eyebrow mt-2 text-ink-3">Elevación en metros, calculada del archivo GPX</figcaption>
    </figure>
  );
}
