/** Maximum guests per submission on /invitados (also enforced in submit_guest_list). */
export const MAX_GUESTS = 30;

/** Maximum cars per submission (also enforced in submit_guest_list). */
export const MAX_CARS = 10;

/** Who is sending the list: a runner (verified by bib + name) or someone who is not running. */
export type CrewSubmitter = "runner" | "guest";

export interface CrewFormValues {
  kind: CrewSubmitter;
  bib: string;
  name: string;
  with_runner: string;
  guests: string[];
  cars: string;
  plates: string;
}

/** Spanish message when bib + name don't identify a runner (shared by /invitados and /perfil). */
export const RUNNER_MISMATCH = "El dorsal y el nombre no coinciden con la lista de corredores. Revisa tu número en la página de Corredores.";
