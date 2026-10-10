import { describe, expect, it } from "vitest";
import { storageUrl } from "./env";

describe("storageUrl", () => {
  it("returns site files (leading slash) unchanged", () => {
    expect(storageUrl("/gpx/charity-loopin.gpx", { download: "x.gpx" })).toBe("/gpx/charity-loopin.gpx");
  });

  it("returns null for an empty path", () => {
    expect(storageUrl(null)).toBeNull();
    expect(storageUrl("")).toBeNull();
  });
});
