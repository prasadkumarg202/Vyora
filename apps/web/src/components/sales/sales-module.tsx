"use client";

import {
  coerceRecord,
  computeTax,
  formatPaise,
  resolveFields,
  rupeesToPaise,
  validateRecord,
  validateRequired,
  type BusinessTypeConfig,
  type FieldDef,
  type JsonValue,
  type LineItem,
  type Paise,
  type TaxBreakup,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listInvoices,
  nextInvoiceNumber,
  saveInvoice,
  type InvoiceRow,
} from "~/lib/db/repository";

/**
 * The Sales till — metadata-driven.
 *
 * The whole promise of Vyora is that a chemist bills like a chemist and a
 * jeweller like a jeweller *without any code branching on the vertical*. So this
 * form renders nothing hardcoded: it reads `config.fields` from the business
 * type the shop chose at onboarding and builds one input per declared field. A
 * Medical Store therefore gets Batch No, Expiry, MRP, Schedule and a
 * prescription upload; a jeweller would get gross/net weight, purity and HUID —
 * from the same component. Values are coerced and validated by @vyora/core (so
 * "Expiry must be after today" and "Selling price ≤ MRP" are enforced here), the
 * money-exact engine computes GST, and every captured field is stored on the
 * invoice line so reports like "Expiry alerts" and "Salt-wise sales" can read it
 * back.
 *
 * Everything is local-first: a saved invoice is durable on this device and
 * marked dirty for the sync flush, online or not.
 */

interface DraftLine {
  key: string;
  /** Raw input strings keyed by FieldDef.key (+ the synthetic "rate"). */
  values: Record<string, string>;
}

interface FieldPlan {
  fields: FieldDef[];
  hasQty: boolean;
  hasGst: boolean;
  hasRate: boolean;
}

/**
 * The fields to render for one line, in the config's own order, with the two
 * money-math essentials guaranteed present: every sale needs a selling *Rate*
 * (distinct from a captured MRP), so if the vertical does not declare one we
 * inject it right before GST. Qty and GST are used as-is when the vertical
 * declares them (a chemist does).
 */
function planFields(config: BusinessTypeConfig): FieldPlan {
  const base = resolveFields(config).filter((f) => f.type !== "auto");
  const hasQty = base.some((f) => f.key === "qty");
  const hasGst = base.some((f) => f.key === "gst");
  const hasRate = base.some((f) => f.key === "rate");

  const fields = [...base];
  if (!hasRate) {
    const rate: FieldDef = {
      key: "rate",
      label: "Rate",
      type: "currency",
      required: true,
    };
    const gstIndex = fields.findIndex((f) => f.key === "gst");
    if (gstIndex >= 0) fields.splice(gstIndex, 0, rate);
    else fields.push(rate);
  }
  return { fields, hasQty, hasGst, hasRate };
}

/** A fresh line, prefilling Qty = 1 and GST from the vertical's default rate. */
function blankLine(config: BusinessTypeConfig, plan: FieldPlan): DraftLine {
  const values: Record<string, string> = {};
  for (const f of plan.fields) values[f.key] = "";
  if (plan.hasQty) values.qty = "1";
  if (plan.hasGst && config.gst.default.kind === "fixed") {
    values.gst = String(config.gst.default.bps / 100);
  }
  return { key: crypto.randomUUID(), values };
}

function lineQty(plan: FieldPlan, line: DraftLine): number {
  return plan.hasQty ? Number(line.values.qty || "0") : 1;
}

function lineGstBps(plan: FieldPlan, line: DraftLine): number | undefined {
  if (!plan.hasGst) return undefined;
  return Math.round(Number(line.values.gst || "0") * 100);
}

function isFillable(plan: FieldPlan, line: DraftLine): boolean {
  return lineQty(plan, line) > 0 && safePaise(line.values.rate) > 0;
}

/** Best-effort coercion; a half-typed date should not throw during live typing. */
function safeCoerce(
  config: BusinessTypeConfig,
  values: Record<string, string>,
): Record<string, JsonValue> {
  try {
    return coerceRecord(config, values);
  } catch {
    return {};
  }
}

export function SalesModule({
  orgId,
  userId,
  config,
  supplierStateCode,
}: {
  orgId: string;
  userId: string;
  config: BusinessTypeConfig | null;
  supplierStateCode: string;
}) {
  const plan = useMemo(() => (config ? planFields(config) : null), [config]);

  const [lines, setLines] = useState<DraftLine[]>(() =>
    config && plan ? [blankLine(config, plan)] : [],
  );
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInvoices(await listInvoices(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLineValue = (key: string, fieldKey: string, raw: string) =>
    setLines((ls) =>
      ls.map((l) =>
        l.key === key ? { ...l, values: { ...l.values, [fieldKey]: raw } } : l,
      ),
    );

  const addLine = () =>
    setLines((ls) =>
      config && plan ? [...ls, blankLine(config, plan)] : ls,
    );

  const removeLine = (key: string) =>
    setLines((ls) => ls.filter((l) => l.key !== key));

  // Live GST plus the per-line amounts, all from the engine.
  const calc = useMemo(() => {
    if (!config || !plan) return null;
    const active = lines.filter((l) => isFillable(plan, l));
    const items: LineItem[] = active.map((l) => {
      const item: LineItem = {
        qty: lineQty(plan, l),
        unitPricePaise: safePaise(l.values.rate),
        fields: safeCoerce(config, l.values),
      };
      const bps = lineGstBps(plan, l);
      if (bps !== undefined) item.gstBps = bps;
      return item;
    });

    let tax: TaxBreakup | null = null;
    try {
      tax = items.length
        ? computeTax(config, items, {
            supplierStateCode,
            placeOfSupplyStateCode: supplierStateCode, // intra-state until customer capture
            roundOff: true,
          })
        : null;
    } catch {
      tax = null;
    }

    const byKey = new Map<string, TaxBreakup["lines"][number]>();
    if (tax) active.forEach((l, i) => byKey.set(l.key, tax!.lines[i]!));
    return { active, tax, byKey };
  }, [config, plan, lines, supplierStateCode]);

  async function handleSave() {
    if (!config || !plan || !calc?.tax || calc.active.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Enforce the vertical's own rules before anything is written: required
      // fields (batch, expiry…), expiry-after-today, selling price ≤ MRP,
      // Rx-required-for-schedule-drugs. The messages are the design's verbatim
      // prose.
      const today = todayYmd();
      const problems: string[] = [];
      calc.active.forEach((l, i) => {
        const record: Record<string, JsonValue> = {
          ...l.values,
          rate: l.values.rate, // selling price, referenced by "price ≤ MRP"
        };
        const issues = [
          ...validateRequired(config, l.values),
          ...validateRecord(config, record, { today }),
        ];
        for (const issue of issues) problems.push(`Line ${i + 1}: ${issue.message}`);
      });
      if (problems.length > 0) {
        setError(problems.join(" · "));
        setSaving(false);
        return;
      }

      const id = crypto.randomUUID();
      const number = await nextInvoiceNumber(orgId);

      await saveInvoice({
        id,
        orgId,
        number,
        date: today,
        createdBy: userId,
        subtotalPaise: calc.tax.taxableValuePaise,
        taxPaise: calc.tax.totalTaxPaise,
        totalPaise: calc.tax.grandTotalPaise,
        items: calc.active.map((l, i) => ({
          description:
            (l.values.item_name || l.values.description || `Item ${i + 1}`).trim(),
          qtyMilli: Math.round(lineQty(plan, l) * 1000),
          ratePaise: safePaise(l.values.rate),
          taxBps: calc.tax!.lines[i]?.rateBps ?? lineGstBps(plan, l) ?? 0,
          amountPaise: calc.tax!.lines[i]?.totalPaise ?? (0 as Paise),
          meta: safeCoerce(config, l.values),
        })),
      });

      setLines([blankLine(config, plan)]);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !!calc?.tax && (calc?.active.length ?? 0) > 0 && !saving;

  if (!config || !plan) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1">Sales</h1>
        <EmptyState
          title="Choose your business type first"
          description="Billing fields adapt to your trade. Finish onboarding to pick a business type, then this till shows exactly the fields your shop needs."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Sales</h1>
          <p className="text-body text-content-muted">
            New {config.label} invoice — fields below match your trade. Saves on
            this device, syncs when online.
          </p>
          <p className="text-caption normal-case text-content-muted">
            {config.invoice.template}
            {config.invoice.extras.length > 0
              ? ` · ${config.invoice.extras.join(" · ")}`
              : ""}
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-4">
          {lines.map((line, i) => {
            const lineTax = calc?.byKey.get(line.key);
            return (
              <div
                key={line.key}
                className="rounded-card border border-border p-4"
                data-testid="sale-line"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {plan.fields.map((field) => (
                    <FieldControl
                      key={field.key}
                      field={field}
                      value={line.values[field.key] ?? ""}
                      onChange={(raw) => setLineValue(line.key, field.key, raw)}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-caption normal-case text-content-muted">
                    {lineTax ? (
                      <>
                        Line total{" "}
                        <span className="font-mono text-body text-content">
                          {formatPaise(lineTax.totalPaise)}
                        </span>
                        {lineTax.appliedSlab ? ` · ${lineTax.appliedSlab}` : ""}
                      </>
                    ) : (
                      "Enter rate & qty to price this line"
                    )}
                  </span>
                  {lines.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => removeLine(line.key)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={addLine}>
            + Add line
          </Button>
        </div>

        {calc?.tax ? (
          <div
            className="flex flex-col gap-1 border-t border-border pt-3"
            data-testid="totals"
          >
            <Row label="Taxable" value={formatPaise(calc.tax.taxableValuePaise)} />
            {calc.tax.igstPaise > 0 ? (
              <Row label="IGST" value={formatPaise(calc.tax.igstPaise)} />
            ) : (
              <>
                <Row label="CGST" value={formatPaise(calc.tax.cgstPaise)} />
                <Row label="SGST" value={formatPaise(calc.tax.sgstPaise)} />
              </>
            )}
            {calc.tax.roundOffPaise !== 0 ? (
              <Row label="Round off" value={formatPaise(calc.tax.roundOffPaise)} />
            ) : null}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-body font-semibold">Total</span>
              <span className="font-mono text-h3" data-testid="grand-total">
                {formatPaise(calc.tax.grandTotalPaise)}
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button onClick={handleSave} disabled={!canSave} data-testid="save-invoice">
          {saving ? "Saving…" : "Save invoice"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent invoices</h2>
        {invoices === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Fill the line above and save — it stays on this device, connected or not."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="invoice-list">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 p-4"
                data-testid="invoice-row"
              >
                <div className="flex flex-col">
                  <span className="text-body font-medium">{inv.number}</span>
                  <span className="text-caption normal-case text-content-muted">
                    {inv.date}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {inv.dirty ? (
                    <Badge tone="warning" dot>
                      Unsynced
                    </Badge>
                  ) : null}
                  <span className="font-mono text-body-lg">
                    {formatPaise(inv.total_paise as Paise)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

/**
 * One input, rendered from a FieldDef — the single place field.type becomes a
 * control. Adding a new vertical never touches this: it only adds fields to a
 * config.
 */
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (raw: string) => void;
}) {
  const wide =
    field.key === "item_name" ||
    field.key === "description" ||
    field.key === "salt_composition";
  const span = wide ? "col-span-2" : "col-span-1";

  const labelText =
    field.label + (field.unit ? ` (${field.unit})` : "") + (field.required ? " *" : "");
  const id = `f-${field.key}`;

  const numeric = (raw: string) => raw.replace(/[^\d.]/g, "");

  return (
    <div className={`flex flex-col gap-1 ${span}`}>
      <Label htmlFor={id}>{labelText}</Label>
      {field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
        >
          <option value="">{field.required ? "Select…" : "—"}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <label className="flex min-h-touch items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-body text-content-muted">Yes</span>
        </label>
      ) : field.type === "file" ? (
        <input
          id={id}
          type="file"
          onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
          className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-content file:mr-3 file:rounded-control file:border-0 file:bg-primary-tonal file:px-2 file:py-1 file:text-caption file:text-primary"
        />
      ) : field.type === "date" ? (
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "time" ? (
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "number" ||
        field.type === "currency" ||
        field.type === "percent" ? (
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(numeric(e.target.value))}
          className="text-right font-mono"
          placeholder={field.type === "currency" ? "0.00" : "0"}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.label}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-body text-content-muted">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

/** Rupee string -> paise, tolerant of an empty or partial entry. */
function safePaise(rupees: string): Paise {
  const n = Number((rupees ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
