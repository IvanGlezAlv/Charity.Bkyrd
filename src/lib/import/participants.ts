import {
  BIB_PATTERN, type Cell, cellToString, isEmail, type Issue, mapHeaders, normalizeBib, normalizeGender, normalizeKey, parseDateCell,
} from "./common";

export const PARTICIPANT_FIELDS = {
  external_ref: ["id", "folio", "registro", "id registro", "id inscripcion", "registration id", "reference", "ref"],
  full_name: ["nombre completo", "full name", "corredor", "participante", "nombre y apellidos"],
  first_name: ["nombre", "nombres", "first name", "firstname", "given name"],
  last_name: ["apellido", "apellidos", "last name", "lastname", "surname", "family name"],
  bib: ["dorsal", "numero", "num", "no", "bib", "bib number", "numero de corredor"],
  distance: ["distancia", "distance", "modalidad", "prueba", "carrera", "race"],
  category: ["categoria", "category", "cat"],
  gender: ["sexo", "genero", "gender", "sex", "rama"],
  age: ["edad", "age", "anos"],
  shirt_size: ["talla", "talla playera", "talla de playera", "playera", "shirt size", "size", "jersey"],
  birth_date: ["fecha de nacimiento", "nacimiento", "fecha nacimiento", "birth date", "birthdate", "date of birth", "dob"],
  email: ["correo", "correo electronico", "email", "e mail", "mail"],
  phone: ["telefono", "celular", "movil", "whatsapp", "phone", "mobile"],
  nationality: ["nacionalidad", "pais", "country", "nationality"],
  city: ["ciudad", "city", "localidad"],
  club: ["club", "equipo", "team"],
  emergency_contact_name: ["contacto de emergencia", "contacto emergencia", "emergency contact", "emergency contact name"],
  emergency_contact_phone: ["telefono de emergencia", "telefono emergencia", "emergency phone", "emergency contact phone"],
  medical_notes: ["notas medicas", "informacion medica", "alergias", "medical notes", "medical", "condiciones medicas"],
} as const;

export type ParticipantField = keyof typeof PARTICIPANT_FIELDS;

export interface ImportRow {
  external_ref: string;
  first_name: string;
  last_name: string;
  bib: string;
  distance_slug: string;
  category_code: string;
  gender: string;
  birth_date: string;
  age: string;
  shirt_size: string;
  email: string;
  phone: string;
  nationality: string;
  city: string;
  club: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  medical_notes: string;
}

export interface ExistingEntry {
  participant_id: string;
  external_ref: string | null;
  bib: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
}

export interface ImportContext {
  distances: { slug: string; name: string }[];
  categories: { code: string; name: string }[];
  existing: ExistingEntry[];
}

export type MatchBy = "external_ref" | "bib" | "name_birth_date";

export interface PreviewRow {
  line: number;
  data: ImportRow;
  issues: Issue[];
  match: { participant_id: string; by: MatchBy; name: string } | null;
}

export interface ParticipantPreview {
  rows: PreviewRow[];
  unknownColumns: string[];
  missingColumns: string[];
  summary: { total: number; new: number; matched: number; errors: number; warnings: number };
}

const personKey = (first: string, last: string) => `${normalizeKey(first)}|${normalizeKey(last)}`;

/**
 * Rows with errors are not imported; warnings are informational and the bad
 * value (if any) is left empty rather than guessed.
 *
 * Validates spreadsheet rows (first row = headers) against the race setup and
 * existing participants. Pure function: used for the preview in the browser
 * flow and again on the server immediately before committing.
 */
export function previewParticipants(sheet: Cell[][], ctx: ImportContext): ParticipantPreview {
  const [headerRow = [], ...body] = sheet;
  const { fields, unknown } = mapHeaders(headerRow, PARTICIPANT_FIELDS as unknown as Record<string, string[]>);
  const missingColumns: string[] = [];
  if (!fields.includes("first_name") && !fields.includes("full_name")) missingColumns.push("nombre");
  if (!fields.includes("distance") && ctx.distances.length > 1) missingColumns.push("distancia");

  const distanceByKey = new Map<string, string>();
  for (const d of ctx.distances) {
    distanceByKey.set(normalizeKey(d.slug), d.slug);
    distanceByKey.set(normalizeKey(d.name), d.slug);
  }
  const categoryByKey = new Map<string, string>();
  for (const c of ctx.categories) {
    categoryByKey.set(normalizeKey(c.code), c.code);
    categoryByKey.set(normalizeKey(c.name), c.code);
  }

  const byRef = new Map(ctx.existing.filter((e) => e.external_ref).map((e) => [e.external_ref as string, e]));
  const byBib = new Map(ctx.existing.filter((e) => e.bib).map((e) => [e.bib as string, e]));
  const byPerson = new Map<string, ExistingEntry[]>();
  for (const e of ctx.existing) {
    const k = personKey(e.first_name, e.last_name);
    byPerson.set(k, [...(byPerson.get(k) ?? []), e]);
  }

  const rows: PreviewRow[] = [];
  body.forEach((cells, i) => {
    if (!cells || cells.every((c) => cellToString(c) === "")) return;
    const get = (f: ParticipantField) => {
      const idx = fields.indexOf(f);
      return idx === -1 ? undefined : cells[idx];
    };
    const issues: Issue[] = [];
    const str = (f: ParticipantField) => cellToString(get(f));

    const data: ImportRow = {
      external_ref: str("external_ref"),
      // With only a full-name column the whole name goes in first_name: we never guess where surnames start.
      first_name: str("first_name") || str("full_name"),
      last_name: str("last_name"),
      bib: normalizeBib(get("bib")),
      distance_slug: "",
      category_code: "",
      gender: "",
      birth_date: "",
      age: "",
      shirt_size: str("shirt_size").toUpperCase(),
      email: str("email").toLowerCase(),
      phone: str("phone"),
      nationality: str("nationality"),
      city: str("city"),
      club: str("club"),
      emergency_contact_name: str("emergency_contact_name"),
      emergency_contact_phone: str("emergency_contact_phone"),
      medical_notes: normalizeMedical(str("medical_notes")),
    };

    // An emergency contact typed as "Name 662 123 4567" in one cell is split into name and phone.
    if (!data.emergency_contact_phone && data.emergency_contact_name) {
      const split = splitContact(data.emergency_contact_name);
      data.emergency_contact_name = split.name;
      data.emergency_contact_phone = split.phone;
    }

    if (!data.first_name) issues.push({ level: "error", field: "first_name", message: "Falta el nombre" });

    const distanceRaw = str("distance");
    if (distanceRaw) {
      const slug = distanceByKey.get(normalizeKey(distanceRaw));
      if (slug) data.distance_slug = slug;
      else issues.push({ level: "error", field: "distance", message: `Distancia desconocida: "${distanceRaw}"` });
    } else if (ctx.distances.length === 1) {
      data.distance_slug = ctx.distances[0].slug;
    } else {
      issues.push({ level: "error", field: "distance", message: "Falta la distancia" });
    }

    const categoryRaw = str("category");
    if (categoryRaw) {
      const code = categoryByKey.get(normalizeKey(categoryRaw));
      if (code) data.category_code = code;
      else issues.push({ level: "error", field: "category", message: `Categoría desconocida: "${categoryRaw}"` });
    }

    const gender = normalizeGender(str("gender"));
    if (gender === "invalid") issues.push({ level: "warning", field: "gender", message: `Sexo no reconocido, se deja vacío: "${str("gender")}"` });
    else data.gender = gender ?? "";

    const birth = parseDateCell(get("birth_date"));
    if (birth === "invalid") issues.push({ level: "warning", field: "birth_date", message: `Fecha inválida, se deja vacía: "${str("birth_date")}" (usa AAAA-MM-DD o DD/MM/AAAA)` });
    else data.birth_date = birth ?? "";

    const ageRaw = str("age");
    if (ageRaw) {
      const m = /^(\d{1,3})(\s*(años|anos|years))?$/i.exec(ageRaw);
      const n = m ? Number(m[1]) : NaN;
      if (!m || n < 5 || n > 100) issues.push({ level: "warning", field: "age", message: `Edad inválida, se deja vacía: "${ageRaw}"` });
      else data.age = String(n);
    }
    if (data.shirt_size && !/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|CH|MED|G|EG)$/.test(data.shirt_size)) {
      issues.push({ level: "warning", field: "shirt_size", message: `Talla poco común: "${data.shirt_size}"` });
    }

    if (data.email && !isEmail(data.email)) {
      issues.push({ level: "warning", field: "email", message: `Correo inválido, no se guardará: "${data.email}"` });
      data.email = "";
    }
    else if (data.email && suspiciousDomain(data.email)) issues.push({ level: "warning", field: "email", message: `¿Dominio mal escrito? "${data.email.split("@")[1]}"` });
    for (const [f, label] of [["phone", "Teléfono"], ["emergency_contact_phone", "Teléfono de emergencia"]] as const) {
      if (data[f] && !plausiblePhone(data[f])) issues.push({ level: "warning", field: f, message: `${label} con formato dudoso: "${data[f]}"` });
    }
    if (!data.emergency_contact_name && !data.emergency_contact_phone) issues.push({ level: "warning", field: "emergency_contact_name", message: "Sin contacto de emergencia" });
    else if (!data.emergency_contact_phone) issues.push({ level: "warning", field: "emergency_contact_phone", message: "Contacto de emergencia sin teléfono" });
    if (data.bib && !BIB_PATTERN.test(data.bib)) issues.push({ level: "error", field: "bib", message: `Dorsal inválido: "${data.bib}"` });
    if (!data.bib) issues.push({ level: "warning", field: "bib", message: "Sin dorsal asignado" });

    // Match against existing participants (same order as the database import).
    let match: PreviewRow["match"] = null;
    const name = (e: ExistingEntry) => `${e.first_name} ${e.last_name}`.trim();
    if (data.external_ref && byRef.has(data.external_ref)) {
      const e = byRef.get(data.external_ref)!;
      match = { participant_id: e.participant_id, by: "external_ref", name: name(e) };
    } else if (data.bib && byBib.has(data.bib)) {
      const e = byBib.get(data.bib)!;
      match = { participant_id: e.participant_id, by: "bib", name: name(e) };
      if (personKey(e.first_name, e.last_name) !== personKey(data.first_name, data.last_name)) {
        issues.push({ level: "warning", field: "bib", message: `El dorsal ${data.bib} ya es de ${name(e)}; se actualizaría ese corredor` });
      }
    } else if (data.birth_date) {
      const e = (byPerson.get(personKey(data.first_name, data.last_name)) ?? []).find((x) => x.birth_date === data.birth_date);
      if (e) match = { participant_id: e.participant_id, by: "name_birth_date", name: name(e) };
    }
    if (!match && byPerson.has(personKey(data.first_name, data.last_name))) {
      issues.push({ level: "warning", message: "Posible duplicado: ya existe un corredor con el mismo nombre" });
    }
    if (match && data.bib) {
      const holder = byBib.get(data.bib);
      if (holder && holder.participant_id !== match.participant_id) {
        issues.push({ level: "error", field: "bib", message: `El dorsal ${data.bib} pertenece a ${name(holder)}` });
      }
    }

    rows.push({ line: i + 2, data, issues, match });
  });

  // Duplicates inside the file.
  const bibLines = new Map<string, number[]>();
  const refLines = new Map<string, number[]>();
  const personLines = new Map<string, number[]>();
  for (const r of rows) {
    if (r.data.bib) bibLines.set(r.data.bib, [...(bibLines.get(r.data.bib) ?? []), r.line]);
    if (r.data.external_ref) refLines.set(r.data.external_ref, [...(refLines.get(r.data.external_ref) ?? []), r.line]);
    const pk = `${personKey(r.data.first_name, r.data.last_name)}|${r.data.birth_date || r.data.email}`;
    if (r.data.first_name) personLines.set(pk, [...(personLines.get(pk) ?? []), r.line]);
  }
  const emailNames = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.data.email) emailNames.set(r.data.email, (emailNames.get(r.data.email) ?? new Set()).add(personKey(r.data.first_name, r.data.last_name)));
  }
  const phoneLines = new Map<string, number[]>();
  for (const r of rows) {
    const digits = r.data.phone.replace(/\D/g, "");
    if (digits.length >= 8) phoneLines.set(digits, [...(phoneLines.get(digits) ?? []), r.line]);
  }
  const exact = new Map<string, number>();
  for (const r of rows) {
    const key = JSON.stringify({ ...r.data, medical_notes: "" });
    if (exact.has(key)) r.issues.push({ level: "error", message: `Fila idéntica a la fila ${exact.get(key)}: elimínala` });
    else exact.set(key, r.line);
    const samePhone = phoneLines.get(r.data.phone.replace(/\D/g, "")) ?? [];
    if (samePhone.length > 1) {
      r.issues.push({ level: "warning", field: "phone", message: `Mismo teléfono en las filas ${samePhone.join(", ")}: ¿persona duplicada?` });
    }
    if (r.data.email && (emailNames.get(r.data.email)?.size ?? 0) > 1) {
      r.issues.push({ level: "warning", field: "email", message: "Este correo lo comparten varios corredores" });
    }
  }
  for (const r of rows) {
    const bl = r.data.bib ? bibLines.get(r.data.bib)! : [];
    if (bl.length > 1) r.issues.push({ level: "error", field: "bib", message: `Dorsal repetido en las filas ${bl.join(", ")}` });
    const rl = r.data.external_ref ? refLines.get(r.data.external_ref)! : [];
    if (rl.length > 1) r.issues.push({ level: "error", field: "external_ref", message: `ID repetido en las filas ${rl.join(", ")}` });
    const pl = personLines.get(`${personKey(r.data.first_name, r.data.last_name)}|${r.data.birth_date || r.data.email}`) ?? [];
    if (pl.length > 1) r.issues.push({ level: "warning", message: `Posible persona duplicada en las filas ${pl.join(", ")}` });
  }

  const errors = rows.filter((r) => r.issues.some((x) => x.level === "error")).length;
  return {
    rows,
    unknownColumns: unknown,
    missingColumns,
    summary: {
      total: rows.length,
      new: rows.filter((r) => !r.match).length,
      matched: rows.filter((r) => r.match).length,
      errors: errors + (missingColumns.length ? 1 : 0),
      warnings: rows.filter((r) => r.issues.some((x) => x.level === "warning")).length,
    },
  };
}

const NO_MEDICAL = new Set(["no", "ninguna", "ninguno", "na", "n a", "nada", "nop", "no ninguna", "no ninguno", "ningun", "sin", "todo bien", "none", "nope"]);

/** "No", "Ninguna", "N/A"… mean nothing to report; real conditions are kept verbatim. */
export function normalizeMedical(value: string): string {
  return NO_MEDICAL.has(normalizeKey(value)) ? "" : value;
}

const PHONE_RUN = /(\+?\(?\d[\d\s().-]{6,}\d)/;

export function splitContact(value: string): { name: string; phone: string } {
  const m = PHONE_RUN.exec(value);
  if (!m) return { name: value.trim(), phone: "" };
  const name = value.replace(m[1], "").replace(/[\s:\-–]+$/g, "").replace(/^[\s:\-–]+/g, "").trim();
  return { name, phone: m[1].trim() };
}

/** 10 digits (Mexico), or an explicit international number. */
export function plausiblePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  return digits.length === 10;
}

const DOMAIN_TYPOS = ["gnail.com", "gmial.com", "gmai.com", "gmal.com", "hotmial.com", "hotmal.com", "hotmai.com", "outlok.com", "yahooo.com", "gamil.com"];
export function suspiciousDomain(email: string): boolean {
  return DOMAIN_TYPOS.includes(email.split("@")[1] ?? "");
}
