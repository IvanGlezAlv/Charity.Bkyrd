import type { Metadata } from "next";
import Link from "next/link";
import { getActiveRace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PARTICIPATION_LABEL } from "@/lib/labels";
import { Container } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Corredores" };

interface Entrant {
  registration_id: string;
  bib: string | null;
  first_name: string;
  last_name: string;
  distance_name: string;
  category_name: string | null;
  status: keyof typeof PARTICIPATION_LABEL;
}

/** Public lookup: only the columns exposed by the public_entrants view. */
export default async function EntrantsPage(props: PageProps<"/corredores">) {
  const race = await getActiveRace();
  if (!race) return null; // the layout shows setup instructions instead
  const sp = await props.searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const supabase = await createClient();
  let query = supabase.from("public_entrants").select("registration_id,bib,first_name,last_name,distance_name,category_name,status").eq("race_id", race.id);
  if (q) {
    const safe = q.replace(/[%_,()]/g, " ").trim();
    query = /^#?[A-Za-z0-9-]{1,12}$/.test(q) && /\d/.test(q)
      ? query.eq("bib", q.replace(/^#/, ""))
      : query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`);
  }
  const { data, error } = await query.order("last_name").limit(q ? 50 : 500);
  const entrants = (data ?? []) as Entrant[];

  return (
    <Container className="pt-10">
      <p className="eyebrow">Corredores</p>
      <h1 className="display mt-2 text-6xl sm:text-8xl">Lista de salida.</h1>
      <form className="mt-8 flex max-w-xl gap-2" role="search">
        <label className="flex-1">
          <span className="sr-only">Nombre o dorsal</span>
          <input className="field" name="q" defaultValue={q} placeholder="Nombre o dorsal" />
        </label>
        <button className="btn" type="submit">Buscar</button>
      </form>
      {error ? (
        <p role="alert" className="mt-6 text-signal">No se pudo cargar la lista.</p>
      ) : entrants.length === 0 ? (
        <p className="mt-8 text-ink-2">{q ? "No encontramos a nadie con esa búsqueda." : "La lista de corredores aún no está publicada."}</p>
      ) : (
        <>
          <p className="eyebrow mt-6 text-ink-3">{entrants.length} {entrants.length === 1 ? "corredor" : "corredores"}{q && <> · <Link className="underline" href="/corredores">ver todos</Link></>}</p>
          <ul className="mt-3 divide-y divide-line border-y-2 border-ink">
            {entrants.map((e) => (
              <li key={e.registration_id} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 py-3">
                <span className="display text-3xl tabular">{e.bib ?? "—"}</span>
                <span>
                  <span className="font-bold">{e.first_name} {e.last_name}</span>
                  <span className="eyebrow block text-ink-3">{e.distance_name}{e.category_name ? ` · ${e.category_name}` : ""}</span>
                </span>
                <span className="eyebrow">{PARTICIPATION_LABEL[e.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
