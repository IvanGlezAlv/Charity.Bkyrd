/** Questions on /perfil, in display order. Limits match submit_runner_profile(). */
export const PROFILE_FIELDS = [
  { name: "hometown", label: "¿De dónde eres?", placeholder: "Hermosillo, Sonora", long: false },
  { name: "occupation", label: "¿A qué te dedicas?", placeholder: "", long: false },
  { name: "running_since", label: "¿Desde cuándo corres?", placeholder: "Desde 2019", long: false },
  { name: "experience", label: "Tu experiencia en ultras o backyards", placeholder: "Carreras, distancias, cuántas vueltas has aguantado…", long: true },
  { name: "highlights", label: "Las carreras de las que estás más orgulloso u orgullosa", placeholder: "", long: true },
  { name: "goal", label: "¿Cuál es tu meta en La Charity?", placeholder: "Ej. 24 vueltas", long: false },
  { name: "why_running", label: "¿Por qué corres La Charity?", placeholder: "", long: true },
  { name: "fun_fact", label: "Un dato curioso tuyo para los comentaristas", placeholder: "", long: true },
  { name: "instagram", label: "Instagram (opcional)", placeholder: "@usuario", long: false },
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number]["name"];
export type RunnerProfile = Record<ProfileField, string>;

export const profileMaxLength = (long: boolean) => (long ? 1500 : 200);
