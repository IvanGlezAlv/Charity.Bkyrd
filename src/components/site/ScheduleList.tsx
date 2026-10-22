import { formatDay, formatTime } from "@/lib/time";
import type { Location, ScheduleItem } from "@/lib/types";
import { Markdown } from "@/components/ui/Markdown";

/** The race program. Items can span several days, so each one shows its day as well as its time. */
export function ScheduleList({ items, timezone, locations }: { items: ScheduleItem[]; timezone: string; locations?: Location[] }) {
  return (
    <ol className="border-t border-ink">
      {items.map((s) => (
        <li key={s.id} className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-line py-3 sm:grid-cols-[9rem_1fr]">
          <p>
            <span className="eyebrow block text-ink-2">{formatDay(s.starts_at, timezone)}</span>
            <time className="font-mono text-lg tabular" dateTime={s.starts_at}>
              {formatTime(s.starts_at, timezone)}
              {s.ends_at && <span className="text-ink-3">–{formatTime(s.ends_at, timezone)}</span>}
            </time>
          </p>
          <div>
            <p className="font-bold">{s.title}</p>
            <Markdown className="prose-race text-ink-2">{s.description}</Markdown>
            {s.location_id && locations && <p className="eyebrow mt-1 text-ink-3">{locations.find((l) => l.id === s.location_id)?.name}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
