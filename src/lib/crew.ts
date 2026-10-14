/** Maximum guests a runner can register on /invitados (also enforced in submit_crew_guests). */
export const MAX_GUESTS = 15;

export interface CrewFormValues {
  bib: string;
  runner_name: string;
  guests: string[];
}
