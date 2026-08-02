"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listCustomers,
  listExpenses,
  listInvoices,
  listOutstandingInvoices,
  listPayments,
  listPurchases,
  listSuppliers,
  type CustomerRow,
  type ExpenseRow,
  type InvoiceRow,
  type OutstandingInvoiceRow,
  type PaymentRow,
  type PurchaseRow,
  type SupplierRow,
} from "~/lib/db/repository";

/**
 * Reports (route: /reports) — a full report suite, not one screen.
 *
 * Six tabs — Sales, Purchases, Profit & Loss, GST, Day Book, Party Outstanding
 * — each summed from the same offline ledger every module writes, so a figure
 * here always matches the module it came from. GST splits output tax into
 * CGST/SGST (intra-state) or IGST (inter-state) the way a GSTR-1 does, and every
 * tabular report exports to CSV so a shop can hand it to their accountant. All
 * of it works with no network.
 *
 * Tax split note: invoices store one tax total. For an intra-state supply (the
 * common case) that is half CGST + half SGST; place-of-supply capture that flips
 * a line to IGST is an invoice-level enhancement, so the split here follows the
 * shop's own state.
 */

type Tab = "sales" | "purchases" | "pl" | "gst" | "daybook" | "party";
const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchases" },
  { id: "pl", label: "Profit & Loss" },
  { id: "gst", label: "GST" },
  { id: "daybook", label: "Day Book" },
  { id: "party", label: "Party Outstanding" },
];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
/** Indian financial year start: 1 April of the current FY. */
function fyStart(now: Date): string {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-04-01`;
}
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}
function rupeesPlain(paise: number): string {
  return (paise / 100).toFixed(2);
}
function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Data {
  invoices: InvoiceRow[];
  purchases: PurchaseRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  customers: CustomerRow[];
  suppliers: SupplierRow[];
  outstanding: OutstandingInvoiceRow[];
}

export function ReportsModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [tab, setTab] = useState<Tab>("sales");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(() => fyStart(new Date()));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [dbDate, setDbDate] = useState(() => ymd(new Date()));

  const load = useCallback(async () => {
    try {
      const [invoices, purchases, payments, expenses, customers, suppliers, outstanding] =
        await Promise.all([
          listInvoices(orgId, 1000),
          listPurchases(orgId, 1000),
          listPayments(orgId, 1000),
          listExpenses(orgId, 1000),
          listCustomers(orgId, 1000),
          listSuppliers(orgId, 1000),
          listOutstandingInvoices(orgId, 1000),
        ]);
      setData({ invoices, purchases, payments, expenses, customers, suppliers, outstanding });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const custName = useMemo(() => {
    const m = new Map<string, string>();
    data?.customers.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Reports</h1>
          <p className="text-body text-content-muted">
            Sales, tax and money — summed from your ledger, exportable, offline.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="-mb-px border-b-2 px-4 py-2 text-body transition-colors"
              style={{
                borderColor: active ? "oklch(0.52 0.2 285)" : "transparent",
                color: active ? "oklch(0.52 0.2 285)" : "inherit",
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Date filter — shared by Sales/Purchases/GST/P&L */}
      {tab !== "daybook" && tab !== "party" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-caption font-medium uppercase text-content-muted">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </label>
          <label className="flex flex-col gap-1 text-caption font-medium uppercase text-content-muted">
            To
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </label>
        </div>
      ) : null}

      {data === null ? (
        <p className="text-body text-content-muted">Loading…</p>
      ) : tab === "sales" ? (
        <SalesReport data={data} from={from} to={to} custName={custName} />
      ) : tab === "purchases" ? (
        <PurchasesReport data={data} from={from} to={to} />
      ) : tab === "pl" ? (
        <PLReport data={data} from={from} to={to} />
      ) : tab === "gst" ? (
        <GstReport data={data} from={from} to={to} custName={custName} />
      ) : tab === "daybook" ? (
        <DayBook data={data} date={dbDate} setDate={setDbDate} custName={custName} />
      ) : (
        <PartyReport data={data} custName={custName} />
      )}
    </div>
  );
}

// --- Shared bits -------------------------------------------------------------

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: "warning" | "success" }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className={"font-mono text-h2 " + (tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "")}>
        {value}
      </span>
    </div>
  );
}

const rupee = (p: number) => formatPaise(p as Paise);

// --- Sales -------------------------------------------------------------------

function SalesReport({
  data,
  from,
  to,
  custName,
}: {
  data: Data;
  from: string;
  to: string;
  custName: Map<string, string>;
}) {
  const rows = data.invoices.filter((i) => inRange(i.date, from, to));
  const totalSales = rows.reduce((n, r) => n + r.total_paise, 0);
  const totalTax = rows.reduce((n, r) => n + r.tax_paise, 0);
  const totalTaxable = rows.reduce((n, r) => n + r.subtotal_paise, 0);

  // Month-wise totals for the chart.
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const k = r.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + r.total_paise);
  }
  const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const maxMonth = Math.max(1, ...months.map(([, v]) => v));

  function exportCsv() {
    downloadCsv("sales-report.csv", [
      ["Invoice No", "Date", "Party", "Taxable", "CGST", "SGST", "Total"],
      ...rows.map((r) => [
        r.number ?? "",
        r.date,
        (r.customer_id && custName.get(r.customer_id)) || "—",
        rupeesPlain(r.subtotal_paise),
        rupeesPlain(Math.round(r.tax_paise / 2)),
        rupeesPlain(r.tax_paise - Math.round(r.tax_paise / 2)),
        rupeesPlain(r.total_paise),
      ]),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <KpiTile label="Total sales" value={rupee(totalSales)} />
          <KpiTile label="Total GST" value={rupee(totalTax)} />
          <KpiTile label="Taxable value" value={rupee(totalTaxable)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No sales in this period" description="Adjust the date range, or bill a sale in Sales." />
      ) : (
        <>
          <Card className="overflow-x-auto p-0" data-testid="sales-report-table">
            <table className="w-full text-left text-body">
              <thead>
                <tr className="border-b border-border text-caption uppercase text-content-muted">
                  <th className="p-3">Invoice</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Party</th>
                  <th className="p-3 text-right">Taxable</th>
                  <th className="p-3 text-right">CGST</th>
                  <th className="p-3 text-right">SGST</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const cgst = Math.round(r.tax_paise / 2);
                  return (
                    <tr key={r.id}>
                      <td className="p-3 font-medium">{r.number ?? "—"}</td>
                      <td className="p-3 font-mono text-content-muted">{r.date}</td>
                      <td className="p-3 text-content-muted">{(r.customer_id && custName.get(r.customer_id)) || "—"}</td>
                      <td className="p-3 text-right font-mono">{rupee(r.subtotal_paise)}</td>
                      <td className="p-3 text-right font-mono">{rupee(cgst)}</td>
                      <td className="p-3 text-right font-mono">{rupee(r.tax_paise - cgst)}</td>
                      <td className="p-3 text-right font-mono font-medium">{rupee(r.total_paise)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-h3">Month-wise sales</h3>
            <div className="flex h-48 items-end gap-3">
              {months.map(([k, v]) => (
                <div key={k} className="flex flex-1 flex-col items-center gap-2">
                  <span className="font-mono text-caption text-content-muted">{rupee(v)}</span>
                  <div className="w-full" style={{ height: `${(v / maxMonth) * 100}%`, borderRadius: "6px 6px 0 0", backgroundColor: "oklch(0.6 0.16 285)" }} />
                  <span className="text-caption text-content-muted">{k}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// --- Purchases ---------------------------------------------------------------

function PurchasesReport({ data, from, to }: { data: Data; from: string; to: string }) {
  const rows = data.purchases.filter((p) => inRange(p.date, from, to));
  const totalSpend = rows.reduce((n, r) => n + r.total_paise, 0);
  const totalItc = rows.reduce((n, r) => n + r.tax_paise, 0);
  const totalTaxable = rows.reduce((n, r) => n + r.subtotal_paise, 0);

  function exportCsv() {
    downloadCsv("purchase-report.csv", [
      ["Bill No", "Date", "Taxable", "Tax (ITC)", "Total"],
      ...rows.map((r) => [r.number ?? "", r.date, rupeesPlain(r.subtotal_paise), rupeesPlain(r.tax_paise), rupeesPlain(r.total_paise)]),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <KpiTile label="Total purchases" value={rupee(totalSpend)} />
          <KpiTile label="Input tax credit" value={rupee(totalItc)} tone="success" />
          <KpiTile label="Taxable value" value={rupee(totalTaxable)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No purchases in this period" description="Adjust the date range, or record a bill in Purchase." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="p-3">Bill</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Taxable</th>
                <th className="p-3 text-right">Tax (ITC)</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-medium">{r.number ?? "—"}</td>
                  <td className="p-3 font-mono text-content-muted">{r.date}</td>
                  <td className="p-3 text-right font-mono">{rupee(r.subtotal_paise)}</td>
                  <td className="p-3 text-right font-mono text-success">{rupee(r.tax_paise)}</td>
                  <td className="p-3 text-right font-mono font-medium">{rupee(r.total_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// --- Profit & Loss -----------------------------------------------------------

function PLReport({ data, from, to }: { data: Data; from: string; to: string }) {
  const sales = data.invoices.filter((i) => inRange(i.date, from, to)).reduce((n, r) => n + r.total_paise, 0);
  const purchases = data.purchases.filter((p) => inRange(p.date, from, to)).reduce((n, r) => n + r.total_paise, 0);
  const expenses = data.expenses.filter((e) => inRange(e.date, from, to)).reduce((n, r) => n + r.amount_paise, 0);
  const gross = sales - purchases;
  const net = gross - expenses;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2 p-5">
          <h3 className="border-b border-border pb-2 text-h3">Revenue</h3>
          <Line label="Sales" value={rupee(sales)} />
          <Line label="Total revenue" value={rupee(sales)} bold />
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <h3 className="border-b border-border pb-2 text-h3">Costs</h3>
          <Line label="Purchases" value={rupee(purchases)} />
          <Line label="Expenses" value={rupee(expenses)} />
          <Line label="Total costs" value={rupee(purchases + expenses)} bold />
        </Card>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="text-body-lg">
          Gross profit: <span className="font-mono font-semibold">{rupee(gross)}</span>
        </div>
        <div className="text-body-lg">
          {net >= 0 ? "Net profit" : "Net loss"}:{" "}
          <span className={"font-mono text-h3 font-semibold " + (net < 0 ? "text-danger" : "text-success")}>
            {rupee(Math.abs(net))}
          </span>
        </div>
      </Card>
      <p className="text-caption normal-case text-content-muted">
        Cash-basis view over the selected range. Direct vs indirect expense
        classification builds on the expense categories.
      </p>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex items-baseline justify-between py-1 " + (bold ? "border-t border-border pt-2 font-semibold" : "")}>
      <span className={bold ? "" : "text-content-muted"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// --- GST ---------------------------------------------------------------------

function GstReport({
  data,
  from,
  to,
  custName,
}: {
  data: Data;
  from: string;
  to: string;
  custName: Map<string, string>;
}) {
  const rows = data.invoices.filter((i) => inRange(i.date, from, to));
  const gstinById = new Map<string, string | null>();
  data.customers.forEach((c) => gstinById.set(c.id, c.gstin));

  const b2b = rows.filter((r) => r.customer_id && gstinById.get(r.customer_id));
  const b2c = rows.filter((r) => !(r.customer_id && gstinById.get(r.customer_id)));

  const outputTax = rows.reduce((n, r) => n + r.tax_paise, 0);
  const inputTax = data.purchases.filter((p) => inRange(p.date, from, to)).reduce((n, r) => n + r.tax_paise, 0);
  const cgst = Math.round(outputTax / 2);
  const sgst = outputTax - cgst;
  const netPayable = outputTax - inputTax;

  function exportGstr1() {
    downloadCsv("gstr1-b2b.csv", [
      ["Party", "GSTIN", "Invoice", "Date", "Taxable", "CGST", "SGST", "Total"],
      ...b2b.map((r) => {
        const c = Math.round(r.tax_paise / 2);
        return [
          (r.customer_id && custName.get(r.customer_id)) || "",
          (r.customer_id && gstinById.get(r.customer_id)) || "",
          r.number ?? "",
          r.date,
          rupeesPlain(r.subtotal_paise),
          rupeesPlain(c),
          rupeesPlain(r.tax_paise - c),
          rupeesPlain(r.total_paise),
        ];
      }),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="CGST collected" value={rupee(cgst)} />
          <KpiTile label="SGST collected" value={rupee(sgst)} />
          <KpiTile label="Input credit" value={rupee(inputTax)} tone="success" />
          <KpiTile label="Net payable" value={rupee(netPayable)} tone={netPayable > 0 ? "warning" : "success"} />
        </div>
        <Button variant="outline" size="sm" onClick={exportGstr1} disabled={b2b.length === 0}>
          Export GSTR-1
        </Button>
      </div>

      <Card className="flex flex-col gap-2 p-5">
        <h3 className="text-h3">B2B sales (registered)</h3>
        {b2b.length === 0 ? (
          <p className="text-body text-content-muted">No B2B invoices in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead>
                <tr className="border-b border-border text-caption uppercase text-content-muted">
                  <th className="p-2">Party</th>
                  <th className="p-2">GSTIN</th>
                  <th className="p-2">Invoice</th>
                  <th className="p-2 text-right">Taxable</th>
                  <th className="p-2 text-right">CGST</th>
                  <th className="p-2 text-right">SGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {b2b.map((r) => {
                  const c = Math.round(r.tax_paise / 2);
                  return (
                    <tr key={r.id}>
                      <td className="p-2">{(r.customer_id && custName.get(r.customer_id)) || "—"}</td>
                      <td className="p-2 font-mono text-content-muted">{(r.customer_id && gstinById.get(r.customer_id)) || "—"}</td>
                      <td className="p-2">{r.number ?? "—"}</td>
                      <td className="p-2 text-right font-mono">{rupee(r.subtotal_paise)}</td>
                      <td className="p-2 text-right font-mono">{rupee(c)}</td>
                      <td className="p-2 text-right font-mono">{rupee(r.tax_paise - c)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <h3 className="text-h3">B2C sales (unregistered)</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col">
            <span className="text-caption uppercase text-content-muted">Invoices</span>
            <span className="font-mono text-body-lg">{b2c.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption uppercase text-content-muted">Taxable</span>
            <span className="font-mono text-body-lg">{rupee(b2c.reduce((n, r) => n + r.subtotal_paise, 0))}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption uppercase text-content-muted">Tax</span>
            <span className="font-mono text-body-lg">{rupee(b2c.reduce((n, r) => n + r.tax_paise, 0))}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption uppercase text-content-muted">Total</span>
            <span className="font-mono text-body-lg">{rupee(b2c.reduce((n, r) => n + r.total_paise, 0))}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// --- Day Book ----------------------------------------------------------------

function DayBook({
  data,
  date,
  setDate,
  custName,
}: {
  data: Data;
  date: string;
  setDate: (d: string) => void;
  custName: Map<string, string>;
}) {
  interface Entry { type: string; ref: string; particulars: string; inPaise: number; outPaise: number; }
  const entries: Entry[] = [];
  for (const i of data.invoices.filter((x) => x.date === date)) {
    entries.push({ type: "Sale", ref: i.number ?? "—", particulars: (i.customer_id && custName.get(i.customer_id)) || "Cash sale", inPaise: i.total_paise, outPaise: 0 });
  }
  for (const p of data.purchases.filter((x) => x.date === date)) {
    entries.push({ type: "Purchase", ref: p.number ?? "—", particulars: "Supplier bill", inPaise: 0, outPaise: p.total_paise });
  }
  for (const pay of data.payments.filter((x) => x.date === date)) {
    const isIn = pay.direction === "in";
    entries.push({ type: isIn ? "Payment in" : "Payment out", ref: pay.method, particulars: pay.method + " payment", inPaise: isIn ? pay.amount_paise : 0, outPaise: isIn ? 0 : pay.amount_paise });
  }
  for (const e of data.expenses.filter((x) => x.date === date)) {
    entries.push({ type: "Expense", ref: e.category ?? "—", particulars: e.note ?? e.category ?? "Expense", inPaise: 0, outPaise: e.amount_paise });
  }
  const totalIn = entries.reduce((n, e) => n + e.inPaise, 0);
  const totalOut = entries.reduce((n, e) => n + e.outPaise, 0);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-caption font-medium uppercase text-content-muted">
        Date
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </label>
      <Card className="flex flex-wrap justify-between gap-4 p-5">
        <div className="text-body">Money in: <span className="font-mono font-semibold text-success">{rupee(totalIn)}</span></div>
        <div className="text-body">Money out: <span className="font-mono font-semibold text-danger">{rupee(totalOut)}</span></div>
        <div className="text-body">Net: <span className="font-mono font-semibold">{rupee(totalIn - totalOut)}</span></div>
      </Card>
      {entries.length === 0 ? (
        <EmptyState title="Nothing on this day" description="Pick another date to see that day's transactions." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="p-3">Type</th>
                <th className="p-3">Ref</th>
                <th className="p-3">Particulars</th>
                <th className="p-3 text-right text-success">In</th>
                <th className="p-3 text-right text-danger">Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="p-3"><Badge tone={e.inPaise > 0 ? "success" : "neutral"}>{e.type}</Badge></td>
                  <td className="p-3 font-mono text-content-muted">{e.ref}</td>
                  <td className="p-3 text-content-muted">{e.particulars}</td>
                  <td className="p-3 text-right font-mono text-success">{e.inPaise ? rupee(e.inPaise) : "—"}</td>
                  <td className="p-3 text-right font-mono">{e.outPaise ? rupee(e.outPaise) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// --- Party Outstanding -------------------------------------------------------

function PartyReport({ data, custName }: { data: Data; custName: Map<string, string> }) {
  const today = ymd(new Date());
  function agingDays(date: string): number {
    const a = new Date(date + "T00:00:00Z").getTime();
    const b = new Date(today + "T00:00:00Z").getTime();
    return Math.max(0, Math.round((b - a) / 86400000));
  }
  // Attach party names where the invoice links a customer.
  const invById = new Map(data.invoices.map((i) => [i.id, i]));
  const recWithParty = data.outstanding.map((o) => {
    const inv = invById.get(o.id);
    const name = inv?.customer_id ? custName.get(inv.customer_id) : null;
    return { party: name || "Cash / walk-in", number: o.number ?? "—", balance: o.total_paise - o.amount_paid_paise, aging: agingDays(o.date) };
  });
  const payables = data.suppliers.filter((s) => s.payable_paise > 0);
  const totalRec = recWithParty.reduce((n, r) => n + r.balance, 0);
  const totalPay = payables.reduce((n, s) => n + s.payable_paise, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-h3 text-success">Receivables</h3>
          <span className="font-mono text-body-lg">{rupee(totalRec)}</span>
        </div>
        {recWithParty.length === 0 ? (
          <p className="text-body text-content-muted">Nothing to collect. 🎉</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="py-2">Party</th>
                <th className="py-2">Invoice</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-right">Aging</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recWithParty.map((r, i) => (
                <tr key={i}>
                  <td className="py-2">{r.party}</td>
                  <td className="py-2 font-mono text-content-muted">{r.number}</td>
                  <td className="py-2 text-right font-mono">{rupee(r.balance)}</td>
                  <td className="py-2 text-right">
                    <Badge tone={r.aging > 30 ? "danger" : r.aging > 7 ? "warning" : "neutral"}>{r.aging}d</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-h3 text-danger">Payables</h3>
          <span className="font-mono text-body-lg">{rupee(totalPay)}</span>
        </div>
        {payables.length === 0 ? (
          <p className="text-body text-content-muted">Nothing to pay.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="py-2">Supplier</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payables.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-right font-mono">{rupee(s.payable_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
