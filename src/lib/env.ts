/**
 * Public configuration. Only NEXT_PUBLIC_* values may be read here, since this
 * module is imported by client components. Server-only secrets live in
 * supabase/admin.ts.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  raceSlug: process.env.NEXT_PUBLIC_RACE_SLUG ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export const STORAGE_BUCKET = "race-assets";

/** Public URL of a file in the race-assets bucket. */
export function storageUrl(path: string | null | undefined, opts: { download?: string } = {}): string | null {
  if (!path || !env.supabaseUrl) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${env.supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${encoded}`;
  return opts.download ? `${url}?download=${encodeURIComponent(opts.download)}` : url;
}
