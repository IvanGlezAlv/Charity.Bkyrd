import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Acceso staff", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/admin";
  const noRole = sp.error === "sin-permisos";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-10 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wordmark.webp" alt="La Charity Bkyrd Ultra" className="h-10 w-auto mix-blend-multiply" />
      </Link>
      <h1 className="display mb-2 text-6xl">Staff.</h1>
      <p className="mb-8 text-ink-2">Acceso para organizadores y cronometraje. Las cuentas las crea un administrador.</p>
      {noRole && <p role="alert" className="mb-4 border-l-4 border-signal bg-signal/10 px-3 py-2 text-signal">Tu cuenta no tiene permisos de staff. Pide a un administrador que te asigne un rol.</p>}
      {isSupabaseConfigured ? <LoginForm next={next} /> : <p className="text-signal">Supabase no está configurado.</p>}
    </main>
  );
}
