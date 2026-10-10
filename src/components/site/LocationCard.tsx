import type { Location } from "@/lib/types";
import { LOCATION_LABEL, mapsLinks } from "@/lib/labels";

export function LocationCard({ location }: { location: Location }) {
  const hasCoords = location.latitude != null && location.longitude != null;
  const links = hasCoords ? mapsLinks(Number(location.latitude), Number(location.longitude), location.name) : null;
  return (
    <article className="flex flex-col gap-3 border-2 border-ink p-4">
      <header>
        <p className="eyebrow text-ink-2">{LOCATION_LABEL[location.kind]}</p>
        <h3 className="text-xl font-bold">{location.name}</h3>
      </header>
      {location.address && <p>{location.address}</p>}
      {location.description && <p className="text-ink-2">{location.description}</p>}
      {hasCoords && (
        <p className="font-mono text-sm tabular">
          GPS {Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}
        </p>
      )}
      {links && (
        <div className="mt-auto flex flex-wrap gap-2">
          <a className="btn" href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
          <a className="btn btn-ghost" href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
          <a className="btn btn-ghost" href={links.waze} target="_blank" rel="noopener noreferrer">Waze</a>
        </div>
      )}
    </article>
  );
}
