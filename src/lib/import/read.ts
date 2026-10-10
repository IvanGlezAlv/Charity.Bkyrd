import "server-only";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import type { Cell } from "./common";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export class SheetError extends Error {}

/** Reads a CSV/TSV/XLSX upload (or pasted text) into rows of cells. */
export async function readSpreadsheet(input: File | string): Promise<Cell[][]> {
  let rows: Cell[][];
  if (typeof input === "string") {
    rows = parseDelimited(input);
  } else {
    if (input.size === 0) throw new SheetError("El archivo está vacío.");
    if (input.size > MAX_IMPORT_BYTES) throw new SheetError("El archivo supera 5 MB.");
    const buf = Buffer.from(await input.arrayBuffer());
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // .xlsx is a zip container
    if (isZip) {
      try {
        rows = (await readSheet(buf)) as Cell[][];
      } catch {
        throw new SheetError("No se pudo leer el Excel. Guarda el archivo como .xlsx o .csv.");
      }
    } else if (/\.xls$/i.test(input.name)) {
      throw new SheetError("El formato .xls antiguo no es compatible. Guarda como .xlsx o .csv.");
    } else {
      rows = parseDelimited(buf.toString("utf8").replace(/^﻿/, ""));
    }
  }
  rows = rows.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  if (rows.length < 2) throw new SheetError("El archivo necesita una fila de encabezados y al menos una fila de datos.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new SheetError(`Máximo ${MAX_IMPORT_ROWS} filas por importación.`);
  return rows;
}

function parseDelimited(text: string): Cell[][] {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, delimiter: "" });
  if (result.errors.length && result.data.length === 0) throw new SheetError("No se pudo leer el archivo CSV.");
  return result.data;
}
