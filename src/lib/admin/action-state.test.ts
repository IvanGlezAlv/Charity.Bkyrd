import { describe, expect, it } from "vitest";
import { friendlyError } from "./action-state";

describe("friendlyError", () => {
  it("translates database exceptions", () => {
    expect(friendlyError({ message: "Runner is marked DNS. Change the status before recording times." })).toMatch(/marcado como DNS/);
    expect(friendlyError({ message: "Set the start time of Backyard before recording laps" })).toBe("Configura la hora de salida de Backyard antes de registrar vueltas.");
    expect(friendlyError({ code: "42501", message: "Not authorized to record timing" })).toBe("No tienes permiso para esta acción.");
  });
  it("passes unknown messages through", () => {
    expect(friendlyError(new Error("algo raro"))).toBe("algo raro");
  });
});
