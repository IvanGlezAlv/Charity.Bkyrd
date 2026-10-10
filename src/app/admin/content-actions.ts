"use server";

import { revalidatePath } from "next/cache";
import { requireActionRole } from "@/lib/auth";
import { getActiveRace } from "@/lib/data";
import { COLLECTIONS, RACE_FIELDS, type FieldDef } from "@/lib/admin/collections";
import { parseFields } from "@/lib/admin/parse";
import { type ActionState, friendlyError } from "@/lib/admin/action-state";
import { readGpxText, safeName, upload, UploadError, validateImage, validatePdf } from "@/lib/admin/uploads";
import { GpxError, parseGpx } from "@/lib/gpx";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/", "layout");
}

async function refSets(supabase: SupabaseClient, raceId: string) {
  const [{ data: locs }, { data: dists }] = await Promise.all([
    supabase.from("locations").select("id").eq("race_id", raceId),
    supabase.from("race_distances").select("id").eq("race_id", raceId),
  ]);
  return {
    locations: new Set((locs ?? []).map((r) => r.id as string)),
    distances: new Set((dists ?? []).map((r) => r.id as string)),
  };
}

/** Uploads any image fields present in the form; returns their new storage paths. */
async function handleImages(supabase: SupabaseClient, raceId: string, fields: FieldDef[], form: FormData) {
  const out: Record<string, string | null> = {};
  for (const f of fields.filter((x) => x.type === "image")) {
    if (form.get(`${f.name}__remove`) === "on") out[f.name] = null;
    const file = form.get(f.name);
    if (file instanceof File && file.size > 0) {
      const { ext, contentType } = await validateImage(file);
      const path = `${raceId}/${f.folder ?? "images"}/${Date.now()}-${safeName(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
      out[f.name] = await upload(supabase, path, file, contentType);
    }
  }
  return out;
}

export async function saveCollectionItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const def = COLLECTIONS[String(form.get("__collection"))];
    if (!def) return { ok: false, message: "Colección desconocida." };
    const id = String(form.get("__id") ?? "");
    if (id && !UUID.test(id)) return { ok: false, message: "Registro inválido." };

    const { values, errors } = parseFields(def.fields, form, race.timezone, await refSets(supabase, race.id));
    if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors };
    Object.assign(values, await handleImages(supabase, race.id, def.fields, form));
    for (const f of def.fields) if (f.name === "sort_order" && values.sort_order === null) values.sort_order = 0;
    Object.assign(values, def.fixed ?? {});

    const table = supabase.from(def.table);
    const { error } = id
      ? await table.update(values).eq("id", id).eq("race_id", race.id)
      : await table.insert({ ...values, race_id: race.id });
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: id ? "Cambios guardados." : `${def.singular[0].toUpperCase()}${def.singular.slice(1)} creada.` };
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, message: err.message };
    return { ok: false, message: friendlyError(err) };
  }
}

export async function deleteCollectionItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const def = COLLECTIONS[String(form.get("__collection"))];
    const id = String(form.get("__id") ?? "");
    if (!race || !def || !UUID.test(id)) return { ok: false, message: "Solicitud inválida." };
    const { error } = await supabase.from(def.table).delete().eq("id", id).eq("race_id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "Eliminado." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function saveRaceSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    if (!race) return { ok: false, message: "No hay carrera configurada." };
    const tz = String(form.get("timezone") ?? race.timezone);
    const { values, errors } = parseFields(RACE_FIELDS, form, tz);
    if (Object.keys(errors).length) return { ok: false, message: "Revisa los campos marcados.", errors };
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: String(values.timezone) });
    } catch {
      return { ok: false, message: "Zona horaria inválida.", errors: { timezone: "Usa un nombre IANA, ej. America/Hermosillo" } };
    }
    Object.assign(values, await handleImages(supabase, race.id, RACE_FIELDS, form));
    const { error } = await supabase.from("races").update(values).eq("id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "Configuración guardada." };
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, message: err.message };
    return { ok: false, message: friendlyError(err) };
  }
}

export async function createRace(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("admin");
    const name = String(form.get("name") ?? "").trim();
    const slug = String(form.get("slug") ?? "").trim();
    if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, message: "Nombre e identificador válidos son obligatorios." };
    const { error } = await supabase.from("races").insert({ name, slug, timezone: String(form.get("timezone") || "America/Hermosillo") });
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "Carrera creada." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function uploadGpx(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, session } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const distanceId = String(form.get("distance_id") ?? "");
    const file = form.get("file");
    if (!race || !UUID.test(distanceId) || !(file instanceof File)) return { ok: false, message: "Selecciona un archivo GPX." };
    const { data: distance } = await supabase.from("race_distances").select("id,slug").eq("id", distanceId).eq("race_id", race.id).maybeSingle();
    if (!distance) return { ok: false, message: "Distancia no encontrada." };

    const text = await readGpxText(file);
    const parsed = parseGpx(text);
    const fileName = safeName(file.name);
    const path = await upload(supabase, `${race.id}/gpx/${distance.slug}-${Date.now()}.gpx`, new Blob([text], { type: "application/gpx+xml" }), "application/gpx+xml");
    const { error } = await supabase.from("race_distances").update({
      gpx_path: path,
      gpx_filename: fileName,
      route_geojson: parsed.route,
      elevation_profile: parsed.profile,
      gpx_stats: parsed.stats,
    }).eq("id", distanceId);
    if (error) return { ok: false, message: friendlyError(error) };
    await supabase.from("documents").insert({
      race_id: race.id, kind: "gpx", title: `GPX ${distance.slug}`, storage_path: path, file_name: fileName,
      mime_type: "application/gpx+xml", size_bytes: file.size, uploaded_by: session.userId,
    });
    refresh();
    return {
      ok: true,
      message: `GPX cargado: ${parsed.stats.distance_km} km medidos, ${parsed.stats.points} puntos${parsed.stats.has_elevation ? `, +${parsed.stats.gain_m} m / −${parsed.stats.loss_m} m` : ", sin datos de elevación"}.`,
    };
  } catch (err) {
    if (err instanceof UploadError || err instanceof GpxError) return { ok: false, message: err.message };
    return { ok: false, message: friendlyError(err) };
  }
}

export async function removeGpx(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const distanceId = String(form.get("distance_id") ?? "");
    if (!race || !UUID.test(distanceId)) return { ok: false, message: "Solicitud inválida." };
    const { error } = await supabase.from("race_distances")
      .update({ gpx_path: null, gpx_filename: null, route_geojson: null, elevation_profile: null, gpx_stats: null })
      .eq("id", distanceId).eq("race_id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: "GPX retirado de la página (el archivo se conserva en el historial de documentos)." };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function uploadManualPdf(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, session } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const file = form.get("file");
    const version = String(form.get("version") ?? "").trim().slice(0, 20);
    if (!race || !(file instanceof File) || file.size === 0) return { ok: false, message: "Selecciona un PDF." };
    if (!version) return { ok: false, message: "Indica la versión del manual.", errors: { version: "Obligatorio" } };
    await validatePdf(file);
    const path = await upload(supabase, `${race.id}/manual/manual-v${safeName(version)}-${Date.now()}.pdf`, file, "application/pdf");
    const now = new Date().toISOString();
    const { error } = await supabase.from("races").update({ manual_pdf_path: path, manual_version: version, manual_updated_at: now }).eq("id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    await supabase.from("documents").insert({
      race_id: race.id, kind: "manual_pdf", title: `Manual v${version}`, storage_path: path, file_name: safeName(file.name),
      mime_type: "application/pdf", size_bytes: file.size, version, uploaded_by: session.userId,
    });
    refresh();
    return { ok: true, message: `Manual v${version} publicado.` };
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, message: err.message };
    return { ok: false, message: friendlyError(err) };
  }
}

export async function updateManualVersion(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireActionRole("organizer");
    const race = await getActiveRace();
    const version = String(form.get("version") ?? "").trim().slice(0, 20);
    if (!race || !version) return { ok: false, message: "Indica la versión.", errors: { version: "Obligatorio" } };
    const { error } = await supabase.from("races").update({ manual_version: version, manual_updated_at: new Date().toISOString() }).eq("id", race.id);
    if (error) return { ok: false, message: friendlyError(error) };
    refresh();
    return { ok: true, message: `Manual marcado como versión ${version}.` };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}
