import type { ActionState } from "@/lib/admin/action-state";

const seen = new WeakMap<ActionState, number>();
let counter = 0;

/**
 * A key that changes with every action result. React resets a form after each
 * submit; keying its fields with this remounts them with the echoed values, so
 * what was typed survives an error.
 */
export function actionStateKey(state: ActionState): number {
  if (!seen.has(state)) seen.set(state, counter++);
  return seen.get(state)!;
}
