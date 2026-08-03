/**
 * CSV in and out — the lingua franca of every billing app.
 *
 * Import accepts what Excel, Vyapar, myBillBook and Tally emit; export writes
 * a UTF-8 BOM so Excel opens Indian names and the ₹ sign correctly instead of
 * mojibake, which is the single most common complaint about exported CSVs.
 */

/** Parse RFC-4180-ish CSV: quoted cells, escaped quotes, CR/LF/CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  // A leading BOM would otherwise become part of the first header name.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows + headers -> a CSV string. */
export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  return [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))]
    .join("\r\n");
}

/** Trigger a browser download of CSV text (BOM included for Excel). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** `vyora-products-2026-08-02.csv` — dated so repeat exports never overwrite. */
export function datedFilename(stem: string): string {
  return `vyora-${stem}-${new Date().toISOString().slice(0, 10)}.csv`;
}
