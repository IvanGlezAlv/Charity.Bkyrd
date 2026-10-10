import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getCheckpoints, getDistances } from "@/lib/data";
import { TimingConsole } from "./TimingConsole";

export const metadata = { title: "Cronometraje" };

export default async function TimingPage() {
  await requirePageRole("timer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const [distances, checkpoints] = await Promise.all([getDistances(race.id), getCheckpoints(race.id)]);
  return (
    <TimingConsole
      raceId={race.id}
      raceName={race.name}
      format={race.format}
      timezone={race.timezone}
      distances={distances.map((d) => ({ id: d.id, name: d.name, start_time: d.start_time, loop_interval_minutes: d.loop_interval_minutes }))}
      checkpoints={checkpoints.map((c) => ({ id: c.id, name: c.name, distance_id: c.distance_id }))}
      resultsOfficial={race.results_publication === "official"}
    />
  );
}
