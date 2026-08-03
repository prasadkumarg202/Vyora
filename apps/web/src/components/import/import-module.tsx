"use client";

import { type Paise } from "@vyora/core";
import { Badge, Button, Card, Label } from "@vyora/ui";
import { useMemo, useRef, useState } from "react";

import {
  exportCustomers,
  exportInvoices,
  exportProducts,
  importCustomers,
  importProducts,
  type DuplicateMode,
  type ImportOutcome,
} from "~/lib/db/repository";
import { datedFilename, downloadCsv, parseCsv, toCsv } from "~/lib/import/csv";
import { canReadXlsx, readXlsx } from "~/lib/import/xlsx";

/**
 * Import & Export — a small on-device ETL pipeline.
 *
 *   Extract    .xlsx or .csv, parsed entirely in the browser. Nothing is
 *              uploaded: a shop's whole customer list never leaves the device.
 *   Transform  columns auto-map by name (aliases cover Vyapar, myBillBook and
 *              Tally export headers); the user corrects anything wrong; values
 *              are coerced (₹ → paise, GST % → bps, qty → milli-units).
 *   Load       one transaction, all-or-nothing, with an explicit answer to the
 *              question every second import asks: what about rows I already
 *              have — skip, update, or add anyway?
 *
 * Rows that could not be imported come back as a downloadable CSV with the
 * reason on each line, so a 2,000-row file with 12 bad rows is a 12-row fix,
 * not a mystery.
 */

type ImportKind = "products" | "customers";
type Step = "upload" | "map" | "done";

interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  /** Lower-cased headers that auto-map here (Vyapar / myBillBook / Tally / plain English). */
  aliases: string[];
}

const TARGETS: Record<ImportKind, TargetField[]> = {
  products: [
    { key: "name", label: "Item name", required: true, aliases: ["name", "item name", "item", "itemname", "product", "product name", "stock item name", "description"] },
    { key: "sku", label: "SKU / Item code", aliases: ["sku", "item code", "itemcode", "code", "barcode", "ean", "part no", "alias", "item alias"] },
    { key: "price", label: "Selling price (₹)", aliases: ["price", "sale price", "sales price", "selling price", "rate", "standard selling price", "mrp", "unit price"] },
    { key: "gst", label: "GST %", aliases: ["gst", "gst%", "gst %", "tax", "tax rate", "tax %", "gst rate", "igst rate", "gst percentage"] },
    { key: "hsn", label: "HSN code", aliases: ["hsn", "hsn/sac", "hsn code", "hsn / sac", "hsn sac", "sac"] },
    { key: "stock", label: "Opening stock", aliases: ["stock", "opening stock", "opening qty", "opening quantity", "current stock", "qty", "quantity", "closing balance", "stock quantity"] },
  ],
  customers: [
    { key: "name", label: "Customer name", required: true, aliases: ["name", "customer name", "party name", "ledger name", "contact name", "customer"] },
    { key: "phone", label: "Phone", aliases: ["phone", "mobile", "mobile no", "mobile number", "phone number", "contact", "contact no", "contact number"] },
    { key: "gstin", label: "GSTIN", aliases: ["gstin", "gst no", "gst number", "gstin/uin", "gstin / uin", "tax number", "gst registration no"] },
  ],
};

const DUPLICATE_MODES: { value: DuplicateMode; label: string; hint: string }[] = [
  { value: "skip", label: "Skip existing", hint: "Safest — only genuinely new rows are added." },
  { value: "update", label: "Update existing", hint: "Refresh prices and details on rows you already have." },
  { value: "duplicate", label: "Add anyway", hint: "Import every row, even if it looks like a duplicate." },
];

interface Rejected {
  rowNumber: number;
  reason: string;
  cells: string[];
}

const num = (raw: string | undefined): number => {
  const n = Number((raw ?? "").replace(/[₹,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function ImportModule({ orgId }: { orgId: string }) {
  const [kind, setKind] = useState<ImportKind>("products");
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<DuplicateMode>("skip");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [report, setReport] = useState<Rejected[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const targets = TARGETS[kind];

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      let grid: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        grid = await readXlsx(file);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        grid = parseCsv(await file.text());
      } else if (/\.xls$/i.test(file.name)) {
        throw new Error(
          "That is the old .xls format. Open it and use Save As → .xlsx or .csv, then upload again.",
        );
      } else {
        throw new Error("Upload an .xlsx or .csv file.");
      }

      if (grid.length < 2) {
        throw new Error("No data rows found — the first row should be the column headings.");
      }

      const hdr = grid[0]!.map((h) => h.trim());
      // Transform step: match each target field to a column by alias.
      const auto: Record<string, number> = {};
      targets.forEach((t) => {
        const idx = hdr.findIndex((h) => t.aliases.includes(h.toLowerCase()));
        if (idx >= 0) auto[t.key] = idx;
      });

      setFileName(file.name);
      setHeaders(hdr);
      setRows(grid.slice(1));
      setMapping(auto);
      setOutcome(null);
      setReport([]);
      setStep("map");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Validate + coerce every row against the current mapping. */
  const prepared = useMemo(() => {
    if (step !== "map") return { valid: [], rejected: [] as Rejected[] };
    const nameIdx = mapping.name;
    const valid: { rowNumber: number; rec: Record<string, string> }[] = [];
    const rejected: Rejected[] = [];
    const seen = new Set<string>();

    rows.forEach((r, i) => {
      const rowNumber = i + 2; // +1 for the header, +1 for 1-based display
      const name = nameIdx !== undefined ? (r[nameIdx] ?? "").trim() : "";
      if (!name) {
        rejected.push({ rowNumber, reason: "Missing name", cells: r });
        return;
      }
      const rec: Record<string, string> = {};
      for (const t of targets) {
        const idx = mapping[t.key];
        rec[t.key] = idx !== undefined ? (r[idx] ?? "").trim() : "";
      }
      // A file that lists the same item twice is a data-entry slip, not intent.
      const key = ((rec.sku || rec.phone || rec.name) ?? "").toLowerCase();
      if (seen.has(key)) {
        rejected.push({ rowNumber, reason: "Repeated in this file", cells: r });
        return;
      }
      seen.add(key);
      valid.push({ rowNumber, rec });
    });

    return { valid, rejected };
  }, [step, rows, mapping, targets]);

  async function handleImport() {
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "products"
          ? await importProducts(
              orgId,
              prepared.valid.map(({ rowNumber, rec }) => ({
                rowNumber,
                name: rec.name!,
                sku: rec.sku || undefined,
                pricePaise: Math.round(num(rec.price) * 100) as Paise,
                taxBps: Math.round(num(rec.gst) * 100),
                hsn: rec.hsn || undefined,
                openingMilli: Math.round(num(rec.stock) * 1000),
              })),
              mode,
            )
          : await importCustomers(
              orgId,
              prepared.valid.map(({ rowNumber, rec }) => ({
                rowNumber,
                name: rec.name!,
                phone: rec.phone || undefined,
                gstin: rec.gstin ? rec.gstin.toUpperCase() : undefined,
              })),
              mode,
            );

      // Everything the user must look at, in one report: rows the file itself
      // ruled out, plus rows the database already had.
      const dbSkipped: Rejected[] = result.skippedRows.map((n) => ({
        rowNumber: n,
        reason: "Already in Vyora (skipped)",
        cells: rows[n - 2] ?? [],
      }));

      setOutcome(result);
      setReport([...prepared.rejected, ...dbSkipped].sort((a, b) => a.rowNumber - b.rowNumber));
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    downloadCsv(
      datedFilename(`${kind}-not-imported`),
      toCsv(["Row", "Reason", ...headers], report.map((r) => [r.rowNumber, r.reason, ...r.cells])),
    );
  }

  function downloadTemplate() {
    const cols = targets.map((t) => t.label.replace(" (₹)", ""));
    const sample =
      kind === "products"
        ? ["Parle-G Biscuit 100g", "8901234567890", "10", "0", "1905", "50"]
        : ["Ramesh Kumar", "9876543210", ""];
    downloadCsv(`vyora-${kind}-template.csv`, toCsv(cols, [sample]));
  }

  async function runExport(what: "products" | "customers" | "invoices") {
    setExporting(what);
    setError(null);
    try {
      if (what === "products") {
        const data = await exportProducts(orgId);
        downloadCsv(
          datedFilename("products"),
          toCsv(
            ["Item name", "SKU", "Selling price", "GST %", "HSN", "Stock"],
            data.map((p) => [
              p.name,
              p.sku ?? "",
              ((p.price_paise ?? 0) / 100).toFixed(2),
              ((p.tax_bps ?? 0) / 100).toString(),
              p.hsn ?? "",
              (p.on_hand_milli / 1000).toString(),
            ]),
          ),
        );
      } else if (what === "customers") {
        const data = await exportCustomers(orgId);
        downloadCsv(
          datedFilename("customers"),
          toCsv(
            ["Customer name", "Phone", "GSTIN", "Outstanding"],
            data.map((c) => [
              c.name,
              c.phone ?? "",
              c.gstin ?? "",
              (c.outstanding_paise / 100).toFixed(2),
            ]),
          ),
        );
      } else {
        const data = await exportInvoices(orgId);
        downloadCsv(
          datedFilename("invoices"),
          toCsv(
            ["Invoice no", "Date", "Customer", "Phone", "GSTIN", "Status", "Taxable", "GST", "Total", "Paid"],
            data.map((i) => [
              i.number ?? "",
              i.date,
              i.customer_name ?? "Walk-in",
              i.customer_phone ?? "",
              i.customer_gstin ?? "",
              i.status,
              (i.subtotal_paise / 100).toFixed(2),
              (i.tax_paise / 100).toFixed(2),
              (i.total_paise / 100).toFixed(2),
              (i.amount_paid_paise / 100).toFixed(2),
            ]),
          ),
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName("");
    setOutcome(null);
    setReport([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const missingRequired = targets.filter((t) => t.required && mapping[t.key] === undefined);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Import &amp; Export</h1>
        <p className="text-body text-content-muted">
          Move data in and out in bulk — Excel, or exports from Vyapar,
          myBillBook and Tally. Everything runs on this device; nothing is
          uploaded, and it works offline.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {/* ---------------- Import ---------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h3">Import</h2>

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

        {step === "upload" ? (
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="text-4xl">📄</span>
            <h3 className="text-h3">Upload your file</h3>
            <p className="max-w-lg text-body text-content-muted">
              Drop in an <b>.xlsx</b> straight from Excel — no converting. Or a{" "}
              <b>.csv</b>, which Vyapar, myBillBook and Tally can all export.
              Column names are matched automatically, in any order.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.txt"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body file:mr-3 file:rounded-control file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
            />
            {busy ? <span className="text-body text-content-muted">Reading file…</span> : null}
            <button onClick={downloadTemplate} className="text-caption font-medium text-primary hover:underline">
              Download a blank {kind === "products" ? "items" : "customers"} template
            </button>
            {!canReadXlsx() ? (
              <p className="text-caption normal-case text-content-muted">
                This browser can&apos;t open .xlsx — please upload a .csv instead.
              </p>
            ) : null}
          </Card>
        ) : null}

        {step === "map" ? (
          <>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-h3">Match your columns</h3>
                <span className="text-caption normal-case text-content-muted">
                  {fileName} · {rows.length} rows
                </span>
              </div>
              <p className="text-body text-content-muted">
                Matched automatically where the names lined up — fix anything
                that looks wrong.
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
              <h3 className="text-h3">If a row already exists</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {DUPLICATE_MODES.map((m) => (
                  <label
                    key={m.value}
                    className={
                      "flex cursor-pointer flex-col gap-1 rounded-card border p-3 " +
                      (mode === m.value ? "border-primary bg-primary-tonal" : "border-border")
                    }
                  >
                    <span className="flex items-center gap-2 text-body font-medium">
                      <input
                        type="radio"
                        name="dupe-mode"
                        checked={mode === m.value}
                        onChange={() => setMode(m.value)}
                        className="accent-primary"
                      />
                      {m.label}
                    </span>
                    <span className="text-caption normal-case text-content-muted">{m.hint}</span>
                  </label>
                ))}
              </div>
              <p className="text-caption normal-case text-content-muted">
                {kind === "products"
                  ? "Rows are matched on SKU, or the item name when there is no SKU. Updating never changes stock on hand — that comes from your movements."
                  : "Rows are matched on phone number, or the customer name when there is no phone."}
              </p>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <h3 className="text-h3">Preview</h3>
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
                    {prepared.valid.slice(0, 5).map(({ rowNumber, rec }) => (
                      <tr key={rowNumber}>
                        {targets.map((t) => (
                          <td key={t.key} className="border-b border-border px-2 py-1">
                            {rec[t.key] || <span className="text-content-muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="success">{prepared.valid.length} rows ready</Badge>
                {prepared.rejected.length > 0 ? (
                  <Badge tone="warning">{prepared.rejected.length} will be skipped</Badge>
                ) : null}
                {missingRequired.length > 0 ? (
                  <Badge tone="danger">
                    Map {missingRequired.map((t) => t.label).join(", ")} first
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleImport}
                  disabled={busy || prepared.valid.length === 0 || missingRequired.length > 0}
                >
                  {busy ? "Importing…" : `Import ${prepared.valid.length} ${kind}`}
                </Button>
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Start over
                </Button>
              </div>
            </Card>
          </>
        ) : null}

        {step === "done" && outcome ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="text-4xl">✅</span>
            <h3 className="text-h3">Import finished</h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge tone="success">{outcome.inserted} added</Badge>
              {outcome.updated > 0 ? <Badge tone="primary">{outcome.updated} updated</Badge> : null}
              {report.length > 0 ? <Badge tone="warning">{report.length} not imported</Badge> : null}
            </div>
            <p className="max-w-md text-body text-content-muted">
              Saved on this device and queued to sync. Find them in{" "}
              {kind === "products" ? "Products and Inventory" : "Customers"}.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {report.length > 0 ? (
                <Button variant="outline" onClick={downloadReport}>
                  Download the {report.length} skipped rows
                </Button>
              ) : null}
              <Button onClick={reset}>Import another file</Button>
            </div>
          </Card>
        ) : null}
      </section>

      {/* ---------------- Export ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">Export</h2>
          <p className="text-body text-content-muted">
            Your data is yours. Download it as CSV any time — for your CA, for
            Tally, or just to keep a copy.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { key: "products", icon: "📦", title: "Items", text: "Catalogue with prices, GST, HSN and live stock." },
              { key: "customers", icon: "👥", title: "Customers", text: "Contacts with GSTIN and what each one owes." },
              { key: "invoices", icon: "🧾", title: "Sales register", text: "Every invoice with party, taxable value and GST." },
            ] as const
          ).map((card) => (
            <Card key={card.key} className="flex flex-col gap-2 p-5">
              <span className="text-2xl">{card.icon}</span>
              <h3 className="text-body-lg font-semibold">{card.title}</h3>
              <p className="text-body text-content-muted">{card.text}</p>
              <Button
                variant="outline"
                className="mt-auto self-start"
                disabled={exporting !== null}
                onClick={() => void runExport(card.key)}
              >
                {exporting === card.key ? "Preparing…" : "Download CSV"}
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
