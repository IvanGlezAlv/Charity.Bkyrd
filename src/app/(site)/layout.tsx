import { getActiveRace, getContacts } from "@/lib/data";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SetupNotice } from "@/components/ui/SetupNotice";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const race = await getActiveRace();
  if (!race) return <SetupNotice />;
  const contacts = await getContacts(race.id);
  return (
    <>
      <SiteHeader race={race} />
      {!race.is_published && (
        <div className="bg-signal px-4 py-2 text-center text-sm text-white">Vista previa del staff: este sitio aún no está publicado.</div>
      )}
      <main id="contenido">{children}</main>
      <SiteFooter race={race} contacts={contacts.filter((c) => c.is_public)} />
    </>
  );
}
