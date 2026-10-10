import { describe, expect, it } from "vitest";
import { previewParticipants, type ImportContext } from "./participants";

const ctx: ImportContext = {
  distances: [{ slug: "backyard", name: "Backyard Ultra" }],
  categories: [{ code: "OPEN", name: "Libre" }, { code: "MASTER", name: "Master 40+" }],
  existing: [
    { participant_id: "p1", external_ref: "R-1", bib: "1", first_name: "Ana", last_name: "López", birth_date: "1990-05-01", email: "ana@x.mx" },
    { participant_id: "p2", external_ref: null, bib: "2", first_name: "Beto", last_name: "Ruiz", birth_date: null, email: null },
  ],
};

describe("previewParticipants", () => {
  it("maps Spanish headers and defaults the only distance", () => {
    const p = previewParticipants(
      [["Nombre", "Apellidos", "Dorsal", "Categoría", "Sexo", "Fecha de nacimiento", "Correo electrónico"],
       ["Carla", "Pérez", 3, "Libre", "Mujer", "07/02/1985", "Carla@X.mx"]],
      ctx,
    );
    expect(p.missingColumns).toEqual([]);
    expect(p.rows[0].data).toMatchObject({
      first_name: "Carla", last_name: "Pérez", bib: "3", distance_slug: "backyard", category_code: "OPEN",
      gender: "F", birth_date: "1985-02-07", email: "carla@x.mx",
    });
    expect(p.rows[0].issues.filter((i) => i.level === "error")).toEqual([]);
    expect(p.summary).toMatchObject({ total: 1, new: 1, matched: 0, errors: 0 });
  });

  it("matches existing runners by reference, bib, then name and birth date", () => {
    const p = previewParticipants(
      [["id", "nombre", "apellido", "dorsal", "nacimiento"],
       ["R-1", "Ana", "López", "", ""],
       ["", "Beto", "Ruiz", "2", ""],
       ["", "ana", "lopez", "", "1990-05-01"]],
      ctx,
    );
    expect(p.rows.map((r) => r.match?.by)).toEqual(["external_ref", "bib", "name_birth_date"]);
  });

  it("flags invalid values, duplicate bibs and unknown distances", () => {
    const p = previewParticipants(
      [["nombre", "dorsal", "distancia", "sexo", "correo", "nacimiento"],
       ["", "5", "backyard", "?", "nope", "31/02/2000"],
       ["Dan", "5", "100K", "M", "", ""],
       ["Eva", "5", "Backyard Ultra", "F", "", ""]],
      ctx,
    );
    const messages = p.rows.map((r) => r.issues.filter((i) => i.level === "error").map((i) => i.field));
    expect(messages[0]).toEqual(expect.arrayContaining(["first_name", "bib"]));
    expect(p.rows[0].issues.filter((i) => i.level === "warning").map((i) => i.field)).toEqual(expect.arrayContaining(["gender", "email", "birth_date"]));
    expect(p.rows[0].data).toMatchObject({ gender: "", email: "", birth_date: "" });
    expect(messages[1]).toEqual(expect.arrayContaining(["distance", "bib"]));
    expect(p.rows[2].data.distance_slug).toBe("backyard");
    expect(p.summary.errors).toBe(3);
  });

  it("warns about a bib already held by a different runner", () => {
    const p = previewParticipants([["nombre", "apellido", "dorsal"], ["Zoe", "Mar", "1"]], ctx);
    expect(p.rows[0].match?.participant_id).toBe("p1");
    expect(p.rows[0].issues.some((i) => i.level === "warning" && i.field === "bib")).toBe(true);
  });

  it("errors when a matched runner would take someone else's bib", () => {
    const p = previewParticipants([["id", "nombre", "apellido", "dorsal"], ["R-1", "Ana", "López", "2"]], ctx);
    expect(p.rows[0].issues.some((i) => i.level === "error" && i.field === "bib")).toBe(true);
  });

  it("requires a distance column when the race has several distances", () => {
    const p = previewParticipants([["nombre"], ["Ana"]], { ...ctx, distances: [...ctx.distances, { slug: "10k", name: "10K" }] });
    expect(p.missingColumns).toContain("distancia");
  });

  it("warns about likely duplicate people in the file and skips blank rows", () => {
    const p = previewParticipants([["nombre", "apellido", "correo"], ["Ana", "Sol", "a@b.co"], [null, "", ""], ["ANA", "sol", "a@b.co"]], ctx);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[1].line).toBe(4);
    expect(p.rows[0].issues.some((i) => i.message.includes("duplicada"))).toBe(true);
  });

  it("handles a registration export with full names, age, size and combined emergency contact", () => {
    const p = previewParticipants(
      [["Nombre completo", "Edad", "Correo", "Talla", "Teléfono", "Contacto de emergencia", "Condiciones médicas"],
       ["Ana Cristina González Estavillo ", "41 años", "Ana@x.com ", "s", "5586195854", "Alejandro Moreno 6331315372", "No"],
       ["Carlos Hector Rodríguez", "56", "c@x.com", "M", "(662) 298-0673", "Alejandra Aguilar - (662) 189-5183", "Presión alta"],
       ["Martin", "37", "mart", "S", "66624464950", "6442589259", "Ninguno"],
       ["Martin", "37", "mart", "S", "66624464950", "6442589259", "ninguna"],
       ["Alex", "25", "a@gnail.com", "L", "6621560362", "", "N/A"]],
      { ...ctx, existing: [] },
    );
    const [ana, carlos, martin, dup, alex] = p.rows;
    expect(ana.data).toMatchObject({ first_name: "Ana Cristina González Estavillo", last_name: "", age: "41", shirt_size: "S", email: "ana@x.com",
      emergency_contact_name: "Alejandro Moreno", emergency_contact_phone: "6331315372", medical_notes: "" });
    expect(carlos.data).toMatchObject({ emergency_contact_name: "Alejandra Aguilar", emergency_contact_phone: "(662) 189-5183", medical_notes: "Presión alta" });
    expect(carlos.issues.filter((i) => i.field === "phone")).toEqual([]);
    expect(martin.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(dup.issues.some((i) => i.level === "error" && i.message.includes("idéntica"))).toBe(true);
    expect(alex.issues.some((i) => i.message.includes("gnail.com"))).toBe(true);
    expect(alex.issues.some((i) => i.field === "emergency_contact_name")).toBe(true);
  });
});
