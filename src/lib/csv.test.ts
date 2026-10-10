import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+52 662")).toBe("'+52 662");
    expect(csvCell("-12.5")).toBe("-12.5");
  });
  it("adds a BOM and CRLF line endings", () => {
    expect(toCsv(["a"], [[null], [3]])).toBe("﻿a\r\n\r\n3\r\n");
  });
});
