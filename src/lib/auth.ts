import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { AppRole } from "@/lib/types";

export interface StaffSession {
  userId: string;
  email: string | null;
  roles: AppRole[];
}

/** An admin implicitly holds every role (mirrors public.has_role in SQL). */
export function roleAllows(roles: AppRole[], role: AppRole): boolean {
  return roles.includes("admin") || roles.includes(role);
}

/** Signed-in user and their roles, verified against the auth server. */
export const getSession = cache(async (): Promise<StaffSession | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: roles } = await supabase.rpc("my_roles");
  return {
    userId,
    email: (claims.claims.email as string | undefined) ?? null,
    roles: ((roles as AppRole[] | null) ?? []),
  };
});

/** For pages: redirects anonymous visitors to login and users without the role to /admin. */
export async function requirePageRole(role?: AppRole): Promise<StaffSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.roles.length === 0) redirect("/login?error=sin-permisos");
  if (role && !roleAllows(session.roles, role)) redirect("/admin?error=sin-permisos");
  return session;
}

export class AuthorizationError extends Error {}

/**
 * For server actions: verifies the caller's role before doing anything. The
 * database enforces the same rules again through RLS and function checks.
 */
export async function requireActionRole(role: AppRole) {
  const session = await getSession();
  if (!session || !roleAllows(session.roles, role)) {
    throw new AuthorizationError("No tienes permiso para esta acción.");
  }
  const supabase = await createClient();
  return { session, supabase };
}
