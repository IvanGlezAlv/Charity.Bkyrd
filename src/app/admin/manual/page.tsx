import Link from "next/link";
import { requirePageRole } from "@/lib/auth";
import { getActiveRace, getDocuments } from "@/lib/data";
import { storageUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/time";
import { AdminPage, PageHeader } from "@/components/admin/PageHeader";
import { CollectionEditor } from "@/components/admin/CollectionEditor";
import { ManualForms } from "./ManualForms";

export const metadata = { title: "Manual del corredor" };

export default async function ManualAdminPage() {
  await requirePageRole("organizer");
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const docs = (await getDocuments(race.id)).filter((d) => d.kind === "manual_pdf");
  return (
    <AdminPage>
      <PageHeader
        title="Manual del corredor"
        description={<>Versión actual: <strong>{race.manual_version ?? "sin versión"}</strong>{race.manual_updated_at && ` · actualizado ${formatDateTime(race.manual_updated_at, race.timezone)}`}. <Link className="underline" href="/manual">Ver manual público</Link></>}
      />
      <section className="mb-12">
        <ManualForms version={race.manual_version} />
        {docs.length > 0 && (
          <>
            <h3 className="eyebrow mb-2 mt-6">Historial de PDFs</h3>
            <ul className="divide-y divide-line border-y border-ink text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-3 py-2">
                  <span className="font-bold">{d.title}</span>
                  <span className="text-ink-2">{formatDateTime(d.created_at, race.timezone)}</span>
                  <a className="ml-auto underline" href={storageUrl(d.storage_path)!} target="_blank" rel="noopener noreferrer">Abrir</a>
                  {race.manual_pdf_path === d.storage_path && <span className="eyebrow text-ok">Publicado</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <CollectionEditor collectionKey="manual-sections" race={race} />
    </AdminPage>
  );
}
