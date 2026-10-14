import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole, roleAllows } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { signOut } from "@/app/login/actions";
import type { AppRole } from "@/lib/types";
import { CreateRaceForm } from "./CreateRaceForm";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

const NAV: (NavItem & { role?: AppRole })[] = [
  { href: "/admin", label: "Resumen del día", group: "Operación" },
  { href: "/admin/cronometraje", label: "Cronometraje", group: "Operación", role: "timer" },
  { href: "/admin/cronometraje/registros", label: "Registros y correcciones", group: "Operación", role: "timer" },
  { href: "/admin/resultados", label: "Resultados", group: "Operación", role: "organizer" },
  { href: "/admin/participantes", label: "Corredores", group: "Corredores", role: "organizer" },
  { href: "/admin/participantes/importar", label: "Importar corredores", group: "Corredores", role: "organizer" },
  { href: "/admin/invitados", label: "Invitados / crew", group: "Corredores", role: "organizer" },
  { href: "/admin/carrera", label: "Carrera y distancias", group: "Configuración", role: "organizer" },
  { href: "/admin/contenido", label: "Contenido del sitio", group: "Configuración", role: "organizer" },
  { href: "/admin/manual", label: "Manual del corredor", group: "Configuración", role: "organizer" },
];

const ROLE_LABEL: Record<AppRole, string> = { admin: "Administrador", organizer: "Organizador", timer: "Cronometraje" };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requirePageRole();
  const race = await getActiveRace();
  const items = NAV.filter((n) => !n.role || roleAllows(session.roles, n.role));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-ink text-paper lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 px-3 py-4">
          <Link href="/" className="font-mono text-xs uppercase tracking-widest text-paper/80 hover:text-paper">← Sitio público</Link>
          <form action={signOut}>
            <button className="font-mono text-xs uppercase tracking-widest text-paper/80 hover:text-paper">Salir</button>
          </form>
        </div>
        <div className="px-3 pb-4">
          <p className="display text-2xl leading-none">{race?.name ?? "Sin carrera"}</p>
          <p className="eyebrow mt-1 text-paper/60">{session.email} · {session.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
        </div>
        <details className="border-t border-paper/20 lg:hidden">
          <summary className="cursor-pointer px-3 py-3 font-mono text-xs uppercase tracking-widest">Menú</summary>
          <div className="pb-2"><AdminNav items={items} /></div>
        </details>
        <div className="hidden border-t border-paper/20 pt-4 lg:block">
          <AdminNav items={items} />
        </div>
      </aside>
      <div className="min-w-0 bg-paper">
        {race ? (
          children
        ) : (
          <div className="mx-auto max-w-xl px-4 py-16">
            <h1 className="display text-5xl">Configura la carrera</h1>
            <p className="mt-3 text-ink-2">Todavía no hay ninguna carrera en la base de datos.</p>
            {roleAllows(session.roles, "admin") ? <CreateRaceForm /> : <p className="mt-6">Pide a un administrador que la cree.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
