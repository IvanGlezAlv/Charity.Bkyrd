import type { Announcement, Race } from "@/lib/types";
import { formatDateTime } from "@/lib/time";
import { Markdown } from "@/components/ui/Markdown";

const STYLE = {
  urgent: "border-signal bg-signal text-white",
  important: "border-ink bg-ink text-paper",
  info: "border-ink bg-paper",
};

export function Announcements({ items, race }: { items: Announcement[]; race: Race }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Avisos" className="space-y-3">
      {items.map((a) => (
        <article key={a.id} className={`border-2 p-4 sm:p-5 ${STYLE[a.severity]}`}>
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-bold">
              {a.severity === "urgent" && <span className="eyebrow mr-2">Urgente</span>}
              {a.title}
            </h3>
            <time className="eyebrow opacity-80" dateTime={a.published_at ?? undefined}>{formatDateTime(a.published_at, race.timezone)}</time>
          </header>
          {a.body && <Markdown className="prose-race mt-2 max-w-none text-[0.98rem] [&_a]:underline">{a.body}</Markdown>}
        </article>
      ))}
    </section>
  );
}
