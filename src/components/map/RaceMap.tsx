"use client";

import dynamic from "next/dynamic";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  kind: string;
  detail?: string;
}

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" aria-hidden />,
});

/**
 * Interactive map (OpenStreetMap tiles, no API key). Shows only real
 * coordinates entered by organizers or parsed from the uploaded GPX.
 */
export function RaceMap({ markers, route, height = 420, label }: { markers: MapMarker[]; route?: [number, number][] | null; height?: number; label: string }) {
  if (markers.length === 0 && (!route || route.length < 2)) {
    return (
      <div className="flex items-center justify-center border-2 border-ink bg-paper-2 p-6 text-center text-ink-2" style={{ minHeight: 160 }}>
        El mapa aparecerá cuando los organizadores publiquen coordenadas o el GPX del recorrido.
      </div>
    );
  }
  return (
    <div role="region" aria-label={label} className="relative z-0 border-2 border-ink" style={{ height }}>
      <LeafletMap markers={markers} route={route} height={height - 4} />
    </div>
  );
}
