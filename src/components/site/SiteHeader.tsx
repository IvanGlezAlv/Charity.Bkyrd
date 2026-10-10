import Link from "next/link";
import type { Race } from "@/lib/types";
import { storageUrl } from "@/lib/env";

const NAV = [
  { href: "/info", label: "Info" },
  { href: "/recorrido", label: "Recorrido" },
  { href: "/manual", label: "Manual" },
  { href: "/resultados", label: "Resultados" },
  { href: "/corredores", label: "Corredores" },
];

export function SiteHeader({ race }: { race: Race }) {
  const live = race.event_status === "race_day";
  const logo = storageUrl(race.logo_path) ?? "/brand/wordmark.webp";
  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Saltar al contenido
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label={`${race.name}, inicio`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={race.name} className="h-8 w-auto mix-blend-multiply sm:h-9" />
        </Link>
        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="eyebrow px-3 py-2 hover:bg-ink hover:text-paper">
                  {n.label}
                  {n.href === "/resultados" && live && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-signal align-middle" aria-label="en vivo" />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <details className="relative md:hidden">
          <summary className="btn btn-ghost min-h-10 cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden">Menú</summary>
          <nav aria-label="Principal" className="absolute right-0 mt-2 w-56 border-2 border-ink bg-paper shadow-[4px_4px_0_#121110]">
            <ul>
              {NAV.map((n) => (
                <li key={n.href} className="border-b border-line last:border-0">
                  <Link href={n.href} className="eyebrow block px-4 py-3 hover:bg-ink hover:text-paper">
                    {n.label}
                    {n.href === "/resultados" && live && <span className="ml-2 text-signal">● en vivo</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
