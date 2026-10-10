import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { COLLECTIONS } from "@/lib/admin/collections";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { CollectionEditor } from "@/components/admin/CollectionEditor";

export const metadata = { title: "Contenido" };

const KEYS = ["announcements", "home-sections", "info-sections", "schedule", "faqs", "contacts", "sponsors", "podcast"];

export default async function ContentPage(props: PageProps<"/admin/contenido">) {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const sp = await props.searchParams;
  const current = typeof sp.seccion === "string" && KEYS.includes(sp.seccion) ? sp.seccion : "announcements";
  return (
    <AdminPage>
      <PageHeader title="Contenido del sitio" description="Todo lo que se publica en el sitio se edita aquí. Los cambios se ven al instante." />
      <nav aria-label="Secciones de contenido" className="mb-8 flex flex-wrap gap-2">
        {KEYS.map((k) => (
          <Link key={k} href={`/admin/contenido?seccion=${k}`} aria-current={k === current ? "page" : undefined}
            className={`btn ${k === current ? "" : "btn-ghost"}`}>{COLLECTIONS[k].title}</Link>
        ))}
      </nav>
      <CollectionEditor collectionKey={current} race={race} />
    </AdminPage>
  );
}
