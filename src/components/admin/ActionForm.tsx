"use client";

import { useActionState, type ReactNode } from "react";
import { type ActionState, initialState } from "@/lib/admin/action-state";
import { Feedback } from "./Feedback";

/** Small wrapper for one-off forms backed by a server action. */
export function ActionForm({ action, children, submit, className = "space-y-3", confirmText, danger }: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submit: string;
  className?: string;
  confirmText?: string;
  danger?: boolean;
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, initialState);
  return (
    <form
      action={run}
      className={className}
      onSubmit={confirmText ? (e) => { if (!confirm(confirmText)) e.preventDefault(); } : undefined}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={`btn ${danger ? "btn-danger" : ""}`} disabled={pending}>{pending ? "Procesando…" : submit}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
