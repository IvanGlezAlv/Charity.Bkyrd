"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { MapMarker } from "./RaceMap";

const KIND_GLYPH: Record<string, string> = {
  start: "S", finish: "M", parking: "P", packet_pickup: "K", aid_station: "A", venue: "★", accommodation: "H", other: "•",
  checkpoint: "C", timing_point: "T",
};

function icon(kind: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid #121110;background:${kind === "start" || kind === "finish" ? "#121110" : "#f2efe7"};color:${kind === "start" || kind === "finish" ? "#f2efe7" : "#121110"};font:700 13px/1 ui-monospace,monospace;box-shadow:2px 2px 0 #121110">${KIND_GLYPH[kind] ?? "•"}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28] });
  }, [map, points]);
  return null;
}

export default function LeafletMap({ markers, route, height }: { markers: MapMarker[]; route?: [number, number][] | null; height: number }) {
  const line: [number, number][] = (route ?? []).map(([lon, lat]) => [lat, lon]);
  const all: [number, number][] = [...line, ...markers.map((m) => [m.lat, m.lng] as [number, number])];
  const center: [number, number] = all[0] ?? [29.07, -110.95];

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height, width: "100%" }} attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#121110", weight: 4 }} />}
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#c4241b", weight: 1.5, dashArray: "4 6" }} />}
      {markers.map((m, i) => (
        <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={icon(m.kind)} title={m.label}>
          <Popup>
            <strong>{m.label}</strong>
            {m.detail ? <div>{m.detail}</div> : null}
          </Popup>
        </Marker>
      ))}
      <FitBounds points={all} />
    </MapContainer>
  );
}
