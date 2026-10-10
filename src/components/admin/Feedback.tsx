import type { ActionState } from "@/lib/admin/action-state";

export function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`border-l-4 px-3 py-2 text-sm ${state.ok ? "border-ok bg-ok/10 text-ok" : "border-signal bg-signal/10 text-signal"}`}>
      {state.message}
    </p>
  );
}
