import Link from "next/link";
import type { Contact, Race } from "@/lib/types";

export function SiteFooter({ race, contacts }: { race: Race; contacts: Contact[] }) {
  const organizers = contacts.filter((c) => c.kind === "organizer");
  return (
    <footer className="mt-16 bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/rider.webp" alt="" className="mb-4 h-24 w-auto invert" />
          <p className="display text-3xl">{race.name}</p>
          {race.tagline && <p className="eyebrow mt-2 text-paper/70">{race.tagline}</p>}
        </div>
        <div>
          <p className="eyebrow mb-3 text-paper/60">Contacto</p>
          <ul className="space-y-1">
            {race.contact_email && <li><a className="underline underline-offset-4" href={`mailto:${race.contact_email}`}>{race.contact_email}</a></li>}
            {race.contact_phone && <li><a className="underline underline-offset-4" href={`tel:${race.contact_phone.replace(/\s/g, "")}`}>{race.contact_phone}</a></li>}
            {organizers.map((c) => (
              <li key={c.id}>
                {c.name}
                {c.role ? ` · ${c.role}` : ""}
                {c.phone && <> · <a className="underline underline-offset-4" href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a></>}
              </li>
            ))}
          </ul>
          {race.social_links?.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {race.social_links.map((s) => (
                <li key={s.url}><a className="eyebrow border border-paper/40 px-3 py-2 hover:bg-paper hover:text-ink" href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
              ))}
            </ul>
          )}
        </div>
        <div className="sm:text-right">
          <p className="eyebrow mb-3 text-paper/60">Inscripciones</p>
          <p>{race.registration_note}</p>
          <p className="mt-8"><Link href="/login" className="eyebrow text-paper/60 hover:text-paper">Acceso staff</Link></p>
        </div>
      </div>
    </footer>
  );
}
