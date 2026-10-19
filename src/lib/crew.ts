/** Maximum guests a runner can register on /invitados (also enforced in submit_crew_guests). */
export const MAX_GUESTS = 15;

/** Maximum cars per runner's crew (also enforced in submit_crew). */
export const MAX_CARS = 10;

export interface CrewFormValues {
  bib: string;
  runner_name: string;
  guests: string[];
  cars: string;
  plates: string;
}

/** Spanish message when bib + name don't identify a runner (shared by /invitados and /perfil). */
export const RUNNER_MISMATCH = "El dorsal y el nombre no coinciden con la lista de corredores. Revisa tu número en la página de Corredores.";
