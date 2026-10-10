// Declarative definitions of the editable content tables. The same config
// drives the admin forms (client) and the server-side validation (actions),
// so it must stay serializable: no functions in here.

export type FieldType =
  | "text" | "textarea" | "markdown" | "number" | "integer" | "checkbox" | "select"
  | "datetime" | "date" | "url" | "email" | "image" | "ref" | "links";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  /** For "ref": which lookup list the select is populated from. */
  ref?: "locations" | "distances";
  min?: number;
  max?: number;
  maxLength?: number;
  /** Shown in the list row. */
  summary?: boolean;
  /** Storage folder for "image" fields. */
  folder?: string;
}

export interface CollectionDef {
  key: string;
  table: string;
  title: string;
  singular: string;
  description?: string;
  orderBy: { column: string; ascending: boolean }[];
  fields: FieldDef[];
  /** Fixed column values for this collection (e.g. content page). */
  fixed?: Record<string, string>;
  /** Field shown as the row title. */
  titleField: string;
}

const PUBLISHED: FieldDef = { name: "is_published", label: "Publicado", type: "checkbox" };
const SORT: FieldDef = { name: "sort_order", label: "Orden", type: "integer", min: 0, max: 10000 };
const LAT: FieldDef = { name: "latitude", label: "Latitud", type: "number", min: -90, max: 90, help: "Decimal, ej. 29.110725" };
const LNG: FieldDef = { name: "longitude", label: "Longitud", type: "number", min: -180, max: 180, help: "Decimal, ej. -110.884383" };
const SLUG_HELP = "Minúsculas, números y guiones. Se usa en la URL.";

const sectionFields: FieldDef[] = [
  { name: "title", label: "Título", type: "text", required: true, maxLength: 120, summary: true },
  { name: "slug", label: "Identificador", type: "text", required: true, maxLength: 60, help: SLUG_HELP },
  { name: "body", label: "Contenido", type: "markdown", maxLength: 50000, help: "Markdown: **negritas**, listas con -, tablas, enlaces [texto](url)." },
  SORT,
  PUBLISHED,
];

export const COLLECTIONS: Record<string, CollectionDef> = {
  locations: {
    key: "locations", table: "locations", title: "Ubicaciones", singular: "ubicación", titleField: "name",
    description: "Sede, salida, meta, estacionamiento, entrega de kits y otros puntos. Aparecen en el mapa con enlaces a Google y Apple Maps.",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 120 },
      {
        name: "kind", label: "Tipo", type: "select", required: true, summary: true,
        options: [
          { value: "venue", label: "Sede" }, { value: "start", label: "Salida" }, { value: "finish", label: "Meta" },
          { value: "parking", label: "Estacionamiento" }, { value: "packet_pickup", label: "Entrega de kits" },
          { value: "aid_station", label: "Abastecimiento" }, { value: "accommodation", label: "Hospedaje" }, { value: "other", label: "Otro" },
        ],
      },
      { name: "address", label: "Dirección", type: "text", maxLength: 300 },
      { name: "description", label: "Indicaciones", type: "textarea", maxLength: 2000 },
      LAT, LNG, SORT,
      { name: "is_public", label: "Visible al público", type: "checkbox" },
    ],
  },
  distances: {
    key: "distances", table: "race_distances", title: "Distancias", singular: "distancia", titleField: "name",
    description: "Cada distancia tiene su página, mapa y GPX. En backyard, la distancia es la de una vuelta.",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 80 },
      { name: "slug", label: "Identificador", type: "text", required: true, maxLength: 40, help: SLUG_HELP },
      { name: "distance_km", label: "Distancia oficial (km)", type: "number", min: 0.1, max: 1000, summary: true },
      { name: "elevation_gain_m", label: "Desnivel positivo oficial (m)", type: "integer", min: 0, max: 20000 },
      { name: "elevation_loss_m", label: "Desnivel negativo oficial (m)", type: "integer", min: 0, max: 20000 },
      { name: "start_time", label: "Hora de salida (1ª vuelta)", type: "datetime", summary: true },
      { name: "loop_interval_minutes", label: "Minutos por vuelta (backyard)", type: "integer", min: 1, max: 1440 },
      { name: "cutoff_minutes", label: "Tiempo de corte total en minutos (distancia fija)", type: "integer", min: 1, max: 10000 },
      { name: "start_location_id", label: "Ubicación de salida", type: "ref", ref: "locations" },
      { name: "finish_location_id", label: "Ubicación de meta", type: "ref", ref: "locations" },
      { name: "description", label: "Descripción del recorrido", type: "markdown", maxLength: 20000 },
      { name: "instructions", label: "Indicaciones específicas", type: "markdown", maxLength: 20000 },
      SORT, PUBLISHED,
    ],
  },
  categories: {
    key: "categories", table: "race_categories", title: "Categorías", singular: "categoría", titleField: "name",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 80 },
      { name: "code", label: "Código", type: "text", required: true, maxLength: 20, summary: true, help: "Se usa en la importación de corredores." },
      { name: "gender", label: "Rama", type: "select", options: [{ value: "", label: "Mixta" }, { value: "F", label: "Femenil" }, { value: "M", label: "Varonil" }, { value: "X", label: "No binaria" }] },
      { name: "min_age", label: "Edad mínima", type: "integer", min: 0, max: 120 },
      { name: "max_age", label: "Edad máxima", type: "integer", min: 0, max: 120 },
      SORT,
    ],
  },
  checkpoints: {
    key: "checkpoints", table: "course_checkpoints", title: "Puntos de control", singular: "punto de control", titleField: "name",
    description: "Abastecimientos y controles por distancia. Marca “con cronometraje” solo si el staff registrará pasos ahí.",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "distance_id", label: "Distancia", type: "ref", ref: "distances", required: true, summary: true },
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 80 },
      { name: "kind", label: "Tipo", type: "select", required: true, options: [{ value: "aid_station", label: "Abastecimiento" }, { value: "checkpoint", label: "Control" }, { value: "timing_point", label: "Punto de cronometraje" }] },
      { name: "km_mark", label: "Km", type: "number", min: 0, max: 1000, summary: true },
      { name: "cutoff_minutes", label: "Corte (min desde la salida)", type: "integer", min: 1, max: 10000 },
      { name: "services", label: "Servicios", type: "text", maxLength: 300, help: "Ej. agua, electrolitos, fruta, médico" },
      { name: "notes", label: "Notas", type: "textarea", maxLength: 1000 },
      LAT, LNG, SORT,
      { name: "is_timed", label: "Con cronometraje", type: "checkbox" },
    ],
  },
  schedule: {
    key: "schedule", table: "schedule_items", title: "Programa", singular: "actividad", titleField: "title",
    orderBy: [{ column: "starts_at", ascending: true }],
    fields: [
      { name: "title", label: "Actividad", type: "text", required: true, maxLength: 120 },
      { name: "starts_at", label: "Inicio", type: "datetime", required: true, summary: true },
      { name: "ends_at", label: "Fin", type: "datetime" },
      { name: "description", label: "Detalle", type: "textarea", maxLength: 1000 },
      { name: "location_id", label: "Ubicación", type: "ref", ref: "locations" },
      { name: "distance_id", label: "Distancia", type: "ref", ref: "distances" },
    ],
  },
  "home-sections": {
    key: "home-sections", table: "content_sections", title: "Secciones de inicio", singular: "sección", titleField: "title",
    description: "Bloques de texto en la página de inicio, por ejemplo “Cómo funciona”.",
    fixed: { page: "home" }, orderBy: [{ column: "sort_order", ascending: true }], fields: sectionFields,
  },
  "info-sections": {
    key: "info-sections", table: "content_sections", title: "Información de la carrera", singular: "sección", titleField: "title",
    description: "Cómo llegar, estacionamiento, entrega de kits, equipo obligatorio, reglas, seguridad, hospedaje…",
    fixed: { page: "info" }, orderBy: [{ column: "sort_order", ascending: true }], fields: sectionFields,
  },
  "manual-sections": {
    key: "manual-sections", table: "content_sections", title: "Manual del corredor", singular: "capítulo", titleField: "title",
    description: "Cada capítulo aparece en el índice del manual en línea. El programa y el recorrido se agregan solos al final.",
    fixed: { page: "manual" }, orderBy: [{ column: "sort_order", ascending: true }], fields: sectionFields,
  },
  faqs: {
    key: "faqs", table: "faqs", title: "Preguntas frecuentes", singular: "pregunta", titleField: "question",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "question", label: "Pregunta", type: "text", required: true, maxLength: 300 },
      { name: "answer", label: "Respuesta", type: "markdown", required: true, maxLength: 5000 },
      SORT, PUBLISHED,
    ],
  },
  contacts: {
    key: "contacts", table: "contacts", title: "Contactos", singular: "contacto", titleField: "name",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 120 },
      { name: "kind", label: "Tipo", type: "select", required: true, summary: true, options: [{ value: "organizer", label: "Organización" }, { value: "emergency", label: "Emergencia" }, { value: "medical", label: "Médico" }, { value: "other", label: "Otro" }] },
      { name: "role", label: "Cargo", type: "text", maxLength: 120 },
      { name: "phone", label: "Teléfono", type: "text", maxLength: 40 },
      { name: "email", label: "Correo", type: "email", maxLength: 200 },
      { name: "notes", label: "Notas", type: "textarea", maxLength: 1000 },
      SORT,
      { name: "is_public", label: "Visible al público", type: "checkbox" },
    ],
  },
  sponsors: {
    key: "sponsors", table: "sponsors", title: "Patrocinadores", singular: "patrocinador", titleField: "name",
    orderBy: [{ column: "sort_order", ascending: true }],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, maxLength: 120 },
      { name: "tier", label: "Nivel", type: "text", maxLength: 40, summary: true },
      { name: "website_url", label: "Sitio web", type: "url", maxLength: 300 },
      { name: "logo_path", label: "Logo", type: "image", folder: "sponsors" },
      SORT, PUBLISHED,
    ],
  },
  announcements: {
    key: "announcements", table: "announcements", title: "Avisos", singular: "aviso", titleField: "title",
    description: "Sin fecha de publicación = borrador. Los avisos urgentes se muestran en rojo arriba de la página de inicio.",
    orderBy: [{ column: "published_at", ascending: false }],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, maxLength: 160 },
      { name: "body", label: "Mensaje", type: "markdown", maxLength: 5000 },
      { name: "severity", label: "Importancia", type: "select", required: true, summary: true, options: [{ value: "info", label: "Información" }, { value: "important", label: "Importante" }, { value: "urgent", label: "Urgente" }] },
      { name: "published_at", label: "Publicar desde", type: "datetime", summary: true },
      { name: "expires_at", label: "Ocultar desde", type: "datetime" },
      { name: "is_pinned", label: "Fijado", type: "checkbox" },
    ],
  },
  podcast: {
    key: "podcast", table: "podcast_episodes", title: "Podcast", singular: "episodio", titleField: "title",
    orderBy: [{ column: "sort_order", ascending: true }, { column: "episode_number", ascending: false }],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, maxLength: 120 },
      { name: "episode_number", label: "Número", type: "integer", min: 1, max: 9999, summary: true },
      { name: "description", label: "Descripción", type: "textarea", maxLength: 1000 },
      { name: "listen_url", label: "Enlace para escuchar", type: "url", maxLength: 500 },
      { name: "published_on", label: "Fecha", type: "date" },
      { name: "cover_path", label: "Portada", type: "image", folder: "podcast" },
      SORT, PUBLISHED,
    ],
  },
};

export const RACE_FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre de la carrera", type: "text", required: true, maxLength: 120 },
  { name: "tagline", label: "Lema", type: "text", maxLength: 200 },
  { name: "description", label: "Descripción", type: "markdown", maxLength: 5000 },
  { name: "format", label: "Formato", type: "select", required: true, options: [{ value: "backyard", label: "Backyard (vueltas por hora)" }, { value: "fixed_distance", label: "Distancia fija" }] },
  { name: "event_date", label: "Fecha del evento", type: "date" },
  { name: "timezone", label: "Zona horaria (IANA)", type: "text", required: true, maxLength: 60, help: "Ej. America/Hermosillo. Todas las horas se muestran en esta zona." },
  {
    name: "event_status", label: "Estado del evento", type: "select", required: true,
    options: [
      { value: "upcoming", label: "Próximamente" }, { value: "race_day", label: "Día de carrera" },
      { value: "results_pending", label: "Resultados en revisión" }, { value: "results_published", label: "Resultados publicados" },
      { value: "completed", label: "Finalizado" },
    ],
  },
  { name: "registration_note", label: "Mensaje de inscripciones", type: "text", required: true, maxLength: 200 },
  { name: "venue_name", label: "Sede", type: "text", maxLength: 120 },
  { name: "address", label: "Dirección", type: "text", maxLength: 300 },
  LAT, LNG,
  { name: "contact_email", label: "Correo de contacto", type: "email", maxLength: 200 },
  { name: "contact_phone", label: "Teléfono de contacto", type: "text", maxLength: 40 },
  { name: "ranking_basis", label: "Base de clasificación (distancia fija)", type: "select", required: true, options: [{ value: "gun", label: "Tiempo oficial (desde la salida)" }, { value: "net", label: "Tiempo neto (salida individual)" }] },
  { name: "social_links", label: "Redes sociales", type: "links", help: "Una por línea: Etiqueta | https://…" },
  { name: "logo_path", label: "Logo", type: "image", folder: "brand" },
  { name: "hero_image_path", label: "Foto principal", type: "image", folder: "brand" },
  { name: "is_published", label: "Sitio publicado", type: "checkbox" },
];
