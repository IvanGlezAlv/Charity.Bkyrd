"use client";

import { useActionState } from "react";
import { initialState } from "@/lib/admin/action-state";
import { signIn } from "./actions";
import { Feedback } from "@/components/admin/Feedback";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <button className="btn w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      <Feedback state={state} />
    </form>
  );
}
