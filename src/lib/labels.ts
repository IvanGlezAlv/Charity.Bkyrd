import type { EventStatus, LocationKind, ParticipationStatus, ResultsPublication } from "./types";

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  registered: "Inscrito",
  started: "En carrera",
  finished: "Finalizó",
  dns: "DNS",
  dnf: "DNF",
  dsq: "Descalificado",
};

export const PARTICIPATION_HINT: Record<ParticipationStatus, string> = {
  registered: "Inscrito, sin registros de tiempo",
  started: "Tomó la salida",
  finished: "Terminó la carrera",
  dns: "No tomó la salida",
  dnf: "No terminó",
  dsq: "Descalificado",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: "Próximamente",
  race_day: "Día de carrera",
  results_pending: "Resultados en revisión",
  results_published: "Resultados publicados",
  completed: "Evento finalizado",
};

export const PUBLICATION_LABEL: Record<ResultsPublication, string> = {
  hidden: "Ocultos",
  provisional: "Provisionales",
  official: "Oficiales",
};

export const LOCATION_LABEL: Record<LocationKind, string> = {
  venue: "Sede",
  start: "Salida",
  finish: "Meta",
  parking: "Estacionamiento",
  packet_pickup: "Entrega de kits",
  aid_station: "Abastecimiento",
  accommodation: "Hospedaje",
  other: "Punto de interés",
};

/** Human description for result flags produced by recalculate_results(). */
export function flagLabel(flag: string): string {
  const [code, arg] = flag.split(/:(.*)/s);
  switch (code) {
    case "late_lap": return `Vuelta ${arg} registrada fuera de tiempo`;
    case "early_lap": return `Vuelta ${arg} registrada antes de su salida`;
    case "missing_lap": return `Falta registro de la vuelta ${arg}`;
    case "no_start_time": return "La distancia no tiene hora de salida";
    case "finish_before_start": return "Llegada anterior a la salida";
    case "finished_without_time": return "Marcado como finalizado sin tiempo de llegada";
    case "over_cutoff": return "Fuera del tiempo de corte";
    case "missing_checkpoint": return `Sin paso por ${arg}`;
    case "checkpoint_order": return "Puntos de control fuera de orden";
    case "laps_recorded_for_dns": return "Tiene vueltas pero está como DNS";
    default:
      if (code.startsWith("time_recorded_for_")) return `Tiene tiempo pero está como ${code.replace("time_recorded_for_", "").toUpperCase()}`;
      return flag;
  }
}

export function mapsLinks(lat: number, lng: number, label?: string) {
  const q = label ? encodeURIComponent(label) : "";
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    apple: `https://maps.apple.com/?daddr=${lat},${lng}${q ? `&q=${q}` : ""}`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}
