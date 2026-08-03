"use client";

import { rupeesToPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, Label } from "@vyora/ui";
import { useMemo, useRef, useState } from "react";

import { bulkInsertCustomers, bulkInsertProducts } from "~/lib/db/repository";

/**
 * Bulk import — a small on-device ETL pipeline.
 *
 *   Extract    a CSV file (Excel, Vyapar and Tally all export CSV) is parsed
 *              entirely in the browser; nothing is uploaded anywhere.
 *   Transform  columns are auto-mapped by name (aliases cover Vyapar/Tally
 *              export headers); the user can correct any mapping; values are
 *              coerced (₹ → paise, qty → milli-units, GST % → bps).
 *   Load       valid rows are written to the local database in ONE transaction
 *              via bulkInsert*, marked dirty for sync — all-or-nothing.
 *
 * Offline-first like everything else: a 5,000-row catalog imports with no
 * internet at all.
 */

type ImportKind = "products" | "customers";
type Step = "upload" | "map" | "done";

interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  /** Lower-cased header names that auto-map to this field (Vyapar/Tally/common). */
  aliases: string[];
}

const TARGETS: Record<ImportKind, TargetField[]> = {
  products: [
    { key: "name", label: "Item name", required: true, aliases: ["name", "item name", "item", "product", "product name", "stock item name"] },
    { key: "sku", label: "SKU / Item code", aliases: ["sku", "item code", "code", "barcode", "ean", "part no", "alias"] },
    { key: "price", label: "Selling price (₹)", aliases: ["price", "sale price", "selling price", "rate", "sales price", "standard selling price", "mrp"] },
    { key: "gst", label: "GST %", aliases: ["gst", "gst%", "gst %", "tax", "tax rate", "tax %", "gst rate", "igst rate"] },
    { key: "hsn", label: "HSN code", aliases: ["hsn", "hsn/sac", "hsn code", "hsn/ sac", "sac"] },
    { key: "stock", label: "Opening stock", aliases: ["stock", "opening stock", "opening qty", "current stock", "qty", "quantity", "closing balance"] },
  ],
  customers: [
    { key: "name", label: "Customer name", required: true, aliases: ["name", "customer name", "party name", "ledger name", "contact name"] },
    { key: "phone", label: "Phone", aliases: ["phone", "mobile", "mobile no", "phone number", "contact", "contact no"] },
    { key: "gstin", label: "GSTIN", aliases: ["gstin", "gst no", "gstin/uin", "gst number", "tax number"] },
  ],
};

/** Minimal RFC-4180-ish CSV parser: quotes, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
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
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const num = (raw: string): number => {
  const n = Number(raw.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function ImportModule({ orgId }: { orgId: string }) {
  const [kind, setKind] = useState<ImportKind>("products");
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const targets = TARGETS[kind];

  async function handleFile(file: File) {
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Please upload a .csv file. In Excel / Vyapar / Tally, use Save As or Export → CSV first.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError("That file has no data rows — the first row should be column headings.");
      return;
    }
    const hdr = parsed[0]!.map((h) => h.trim());
    // Auto-map (transform step): match each target field to a header by alias.
    const auto: Record<string, number> = {};
    targets.forEach((t) => {
      const idx = hdr.findIndex((h) => t.aliases.includes(h.toLowerCase()));
      if (idx >= 0) auto[t.key] = idx;
    });
    setFileName(file.name);
    setHeaders(hdr);
    setRows(parsed.slice(1));
    setMapping(auto);
    setStep("map");
  }

  /** Validate + transform every row against the current mapping. */
  const prepared = useMemo(() => {
    if (step !== "map") return { valid: [] as Record<string, string>[], invalid: 0 };
    const nameIdx = mapping.name;
    const valid: Record<string, string>[] = [];
    let invalid = 0;
    for (const r of rows) {
      const name = nameIdx !== undefined ? (r[nameIdx] ?? "").trim() : "";
      if (!name) {
        invalid++;
        continue;
      }
      const rec: Record<string, string> = {};
      for (const t of targets) {
        const idx = mapping[t.key];
        rec[t.key] = idx !== undefined ? (r[idx] ?? "").trim() : "";
      }
      valid.push(rec);
    }
    return { valid, invalid };
  }, [step, rows, mapping, targets]);

  async function handleImport() {
    setBusy(true);
    setError(null);
    try {
      let count = 0;
      if (kind === "products") {
        count = await bulkInsertProducts(
          orgId,
          prepared.valid.map((r) => ({
            name: r.name!,
            sku: r.sku || undefined,
            pricePaise: Math.round(num(r.price ?? "") * 100) as Paise,
            taxBps: Math.round(num(r.gst ?? "") * 100),
            hsn: r.hsn || undefined,
            openingMilli: Math.round(num(r.stock ?? "") * 1000),
          })),
        );
      } else {
        count = await bulkInsertCustomers(
          orgId,
          prepared.valid.map((r) => ({
            name: r.name!,
            phone: r.phone || undefined,
            gstin: r.gstin ? r.gstin.toUpperCase() : undefined,
          })),
        );
      }
      setImported(count);
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName("");
    setImported(0);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const cols = targets.map((t) => t.label.replace(/ \(₹\)/, ""));
    const sample =
      kind === "products"
        ? "Parle-G 100g,8901234567890,10,0,1905,50"
        : "Ramesh Kumar,9876543210,";
    const blob = new Blob([cols.join(",") + "\n" + sample + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vyora-${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Import Data</h1>
        <p className="text-body text-content-muted">
          Bring your catalog and parties in bulk — from Excel, or exports from
          Vyapar, Tally and other apps. Everything runs on this device; nothing
          is uploaded.
        </p>
      </div>

      {/* Kind selector */}
      <div className="flex gap-2">
        {(["products", "customers"] as ImportKind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              reset();
            }}
            className={
              "rounded-control px-4 py-2 text-body font-medium " +
              (kind === k
                ? "bg-primary text-white"
                : "border border-border bg-surface text-content-muted hover:text-primary")
            }
          >
            {k === "products" ? "📦 Items" : "👥 Customers"}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {step === "upload" ? (
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="text-4xl">📄</span>
          <h2 className="text-h3">Upload a CSV file</h2>
          <p className="max-w-md text-body text-content-muted">
            Exporting from another app? In <b>Excel</b>: Save As → CSV. In{" "}
            <b>Vyapar</b>: Items → Export to Excel, then save that file as CSV.
            In <b>Tally</b>: export the Stock Item / Ledger list as CSV. Column
            names are detected automatically.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body file:mr-3 file:rounded-control file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
          />
          <button onClick={downloadTemplate} className="text-caption font-medium text-primary hover:underline">
            Download a blank {kind === "products" ? "items" : "customers"} template
          </button>
        </Card>
      ) : null}

      {step === "map" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h3">Map columns</h2>
              <span className="text-caption normal-case text-content-muted">
                {fileName} · {rows.length} rows
              </span>
            </div>
            <p className="text-body text-content-muted">
              Matched automatically where possible — fix anything that looks
              wrong, then import.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((t) => (
                <div key={t.key} className="flex flex-col gap-1">
                  <Label htmlFor={`map-${t.key}`}>
                    {t.label}
                    {t.required ? " *" : ""}
                  </Label>
                  <select
                    id={`map-${t.key}`}
                    value={mapping[t.key] ?? -1}
                    onChange={(e) =>
                      setMapping((m) => {
                        const v = Number(e.target.value);
                        const next = { ...m };
                        if (v < 0) delete next[t.key];
                        else next[t.key] = v;
                        return next;
                      })
                    }
                    className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
                  >
                    <option value={-1}>— not in file —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Preview</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <thead>
                  <tr>
                    {targets.map((t) => (
                      <th key={t.key} className="border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted">
                        {t.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prepared.valid.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {targets.map((t) => (
                        <td key={t.key} className="border-b border-border px-2 py-1">
                          {r[t.key] || <span className="text-content-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="success">{prepared.valid.length} rows ready</Badge>
              {prepared.invalid > 0 ? (
                <Badge tone="warning">{prepared.invalid} skipped (missing name)</Badge>
              ) : null}
            </div>
            <div className="flex gap-3">
              <Button onClick={handleImport} disabled={busy || prepared.valid.length === 0}>
                {busy ? "Importing…" : `Import ${prepared.valid.length} ${kind}`}
              </Button>
              <Button variant="outline" onClick={reset} disabled={busy}>
                Start over
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {step === "done" ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl">✅</span>
          <h2 className="text-h3">
            {imported} {kind} imported
          </h2>
          <p className="max-w-md text-body text-content-muted">
            Saved on this device and queued to sync. Find them in{" "}
            {kind === "products" ? "Products and Inventory" : "Customers"}.
          </p>
          <Button onClick={reset}>Import another file</Button>
        </Card>
      ) : null}
    </div>
  );
}
