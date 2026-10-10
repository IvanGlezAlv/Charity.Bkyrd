import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/env";

export const LIMITS = { image: 8 * 1024 * 1024, pdf: 25 * 1024 * 1024, gpx: 10 * 1024 * 1024 };

export class UploadError extends Error {}

async function head(file: File, n = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/** Validates an image by its content (magic bytes), not by its name or declared type. */
export async function validateImage(file: File): Promise<{ ext: string; contentType: string }> {
  if (file.size === 0) throw new UploadError("El archivo está vacío.");
  if (file.size > LIMITS.image) throw new UploadError("La imagen supera 8 MB.");
  const b = await head(file);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", contentType: "image/png" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { ext: "webp", contentType: "image/webp" };
  throw new UploadError("Formato no permitido. Usa JPG, PNG o WebP.");
}

export async function validatePdf(file: File): Promise<void> {
  if (file.size === 0) throw new UploadError("El archivo está vacío.");
  if (file.size > LIMITS.pdf) throw new UploadError("El PDF supera 25 MB.");
  const b = await head(file, 5);
  if (String.fromCharCode(...b) !== "%PDF-") throw new UploadError("El archivo no es un PDF válido.");
}

export async function readGpxText(file: File): Promise<string> {
  if (file.size === 0) throw new UploadError("El archivo está vacío.");
  if (file.size > LIMITS.gpx) throw new UploadError("El GPX supera 10 MB.");
  if (!/\.gpx$/i.test(file.name)) throw new UploadError("El archivo debe tener extensión .gpx");
  return await file.text();
}

/** Safe file name for storage paths. */
export function safeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80) || "archivo";
}

export async function upload(supabase: SupabaseClient, path: string, body: Blob | string, contentType: string) {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, body, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new UploadError(`No se pudo subir el archivo: ${error.message}`);
  return path;
}
