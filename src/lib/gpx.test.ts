import { describe, expect, it } from "vitest";
import { GpxError, parseGpx } from "./gpx";

const track = (pts: [number, number, number?][]) => `<?xml version="1.0"?>
<gpx version="1.1" creator="test"><trk><name>Loop</name><trkseg>
${pts.map(([lat, lon, ele]) => `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`).join("\n")}
</trkseg></trk></gpx>`;

describe("parseGpx", () => {
  it("measures distance and elevation from track points", () => {
    // ~1.11 km per 0.01 degree of latitude.
    const gpx = parseGpx(track([[29.0, -111.0, 200], [29.01, -111.0, 210], [29.02, -111.0, 205], [29.03, -111.0, 220]]));
    expect(gpx.stats.distance_km).toBeCloseTo(3.34, 1);
    expect(gpx.stats.gain_m).toBe(25);
    expect(gpx.stats.loss_m).toBe(5);
    expect(gpx.stats.min_ele_m).toBe(200);
    expect(gpx.stats.max_ele_m).toBe(220);
    expect(gpx.route.coordinates[0]).toEqual([-111, 29]);
    expect(gpx.profile?.length).toBe(4);
  });

  it("ignores elevation noise under the threshold", () => {
    const gpx = parseGpx(track([[29, -111, 100], [29.001, -111, 101], [29.002, -111, 100], [29.003, -111, 101.5]]));
    expect(gpx.stats.gain_m).toBe(0);
    expect(gpx.stats.loss_m).toBe(0);
  });

  it("reports no elevation when the file has none", () => {
    const gpx = parseGpx(track([[29, -111], [29.01, -111], [29.02, -111]]));
    expect(gpx.stats.has_elevation).toBe(false);
    expect(gpx.profile).toBeNull();
    expect(gpx.stats.gain_m).toBe(0);
  });

  it("falls back to route points", () => {
    const xml = `<gpx><rte><rtept lat="29" lon="-111"/><rtept lat="29.01" lon="-111"/></rte></gpx>`;
    expect(parseGpx(xml).stats.points).toBe(2);
  });

  it("rejects files that are not usable GPX", () => {
    expect(() => parseGpx("hello")).toThrow(GpxError);
    expect(() => parseGpx("<gpx><trk></trk></gpx>")).toThrow(GpxError);
    expect(() => parseGpx('<!DOCTYPE x [<!ENTITY a "b">]><gpx></gpx>')).toThrow(GpxError);
  });

  it("downsamples very long tracks", () => {
    const pts: [number, number, number][] = Array.from({ length: 5000 }, (_, i) => [29 + i * 0.0001, -111, 100 + (i % 50)]);
    const gpx = parseGpx(track(pts));
    expect(gpx.route.coordinates.length).toBe(2000);
    expect(gpx.profile?.length).toBe(400);
    expect(gpx.stats.points).toBe(5000);
  });
});
