"use client";

import {
  coerceRecord,
  computeDocument,
  formatPaise,
  paiseToRupees,
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
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import {
  InvoiceExtras,
  emptyExtras,
  type Extras,
} from "~/components/sales/invoice-extras";
import { QuickKeys } from "~/components/sales/quick-keys";
import {
  listInvoices,
  nextInvoiceNumber,
  saveInvoice,
  searchProducts,
  type InvoiceRow,
  type ProductPick,
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
 * Above the lines sits the shop's own quick-key row — the four or five items a
 * grocery bills all day, on the digits 1–9. It is derived from their catalogue
 * rather than from a list we guessed for their trade, and its order is fixed
 * until they change it.
 *
 * The item name is a lookup into the shop's own catalogue. Picking a product
 * fills the HSN, the GST rate, the selling price and the MRP from the product
 * record — the three things a shopkeeper otherwise retypes on every line and
 * gets wrong on the one that matters. The filled values stay editable and the
 * product itself is never written back: a one-off price on today's bill must
 * not silently rewrite the catalogue.
 *
 * Everything is local-first: a saved invoice is durable on this device and
 * marked dirty for the sync flush, online or not. That includes the product
 * search, which runs against local SQLite — a lookup that needed the network
 * would be slower than typing the HSN by hand, and useless at a counter with
 * no signal.
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
  /**
   * Which catalogue product each line came from, keyed by line.
   *
   * Kept beside the lines rather than inside them because it is not a captured
   * *field* — it is provenance. It rides through to invoice_items.product_id,
   * which is what lets stock, HSN-wise sales and item-wise profit join back to
   * the catalogue even for a vertical whose form never shows an HSN box.
   */
  const [productByLine, setProductByLine] = useState<Record<string, string>>(
    {},
  );
  const [extras, setExtras] = useState<Extras>(emptyExtras);
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

  /**
   * Fills a line from a catalogue product.
   *
   * Only writes a value the product actually has — a product with no HSN
   * recorded must not blank an HSN the shopkeeper already typed. Everything
   * written here stays editable afterwards; this is a starting point, not a
   * lock.
   */
  const applyProduct = (lineKey: string, product: ProductPick) => {
    setLines((ls) =>
      ls.map((l) =>
        l.key === lineKey
          ? { ...l, values: fillFromProduct(l.values, product, plan) }
          : l,
      ),
    );
    setProductByLine((m) => ({ ...m, [lineKey]: product.id }));
  };

  /**
   * Bills a quick-key product in one keystroke.
   *
   * Reuses the empty line at the bottom instead of always appending, so
   * pressing 1, 2, 3 in a row leaves three lines and not three lines plus a
   * blank one the cashier has to notice and remove.
   *
   * Reads `lines` directly rather than through a state updater, because the
   * new line's key is needed for `productByLine` too — and calling setState
   * from inside another updater runs twice under StrictMode.
   */
  const addProductLine = useCallback(
    (product: ProductPick) => {
      if (!config || !plan) return;

      const last = lines[lines.length - 1];
      const reuseLast =
        last !== undefined &&
        !last.values.item_name?.trim() &&
        safePaise(last.values.rate) === 0;

      const target = reuseLast ? last : blankLine(config, plan);
      const filled = {
        ...target,
        values: fillFromProduct(target.values, product, plan),
      };

      setLines((ls) =>
        reuseLast ? [...ls.slice(0, -1), filled] : [...ls, filled],
      );
      setProductByLine((m) => ({ ...m, [filled.key]: product.id }));
    },
    [config, plan, lines],
  );

  /** Typing over the name means this line is no longer that product. */
  const detachProduct = (lineKey: string) =>
    setProductByLine((m) => {
      if (!(lineKey in m)) return m;
      const next = { ...m };
      delete next[lineKey];
      return next;
    });

  const addLine = () =>
    setLines((ls) => (config && plan ? [...ls, blankLine(config, plan)] : ls));

  const removeLine = (key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
    detachProduct(key);
  };

  // Live GST plus the per-line amounts, all from the engine — including the
  // document discount and any additional charges, because both change the
  // taxable value and therefore the tax. Applying them after the tax is
  // computed would put a number on the invoice that GSTR-1 will not agree
  // with.
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

    let doc: ReturnType<typeof computeDocument> | null = null;
    try {
      doc = items.length
        ? computeDocument(config, {
            lines: items,
            discount: extras.discount ?? undefined,
            charges: extras.charges,
            ctx: {
              supplierStateCode,
              placeOfSupplyStateCode: supplierStateCode, // intra-state until customer capture
              roundOff: extras.roundOff,
            },
          })
        : null;
    } catch {
      doc = null;
    }

    const tax: TaxBreakup | null = doc?.tax ?? null;

    // Only the leading lines map back to form rows; the rest are the charges,
    // which have no row to highlight.
    const byKey = new Map<string, TaxBreakup["lines"][number]>();
    if (tax) active.forEach((l, i) => byKey.set(l.key, tax.lines[i]!));
    return { active, tax, doc, byKey };
  }, [config, plan, lines, supplierStateCode, extras]);

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
          rate: l.values.rate ?? "", // selling price, referenced by "price ≤ MRP"
        };
        const issues = [
          ...validateRequired(config, l.values),
          ...validateRecord(config, record, { today }),
        ];
        for (const issue of issues)
          problems.push(`Line ${i + 1}: ${issue.message}`);
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
        // The document-level facts ride in custom_fields rather than in new
        // columns: they are per-invoice text and money that nothing queries
        // on, and a column apiece would mean a migration on both the local
        // SQLite schema and Postgres for something only the printed document
        // reads back.
        extras: {
          notes: extras.notes,
          terms: extras.terms,
          discountPaise: calc.doc?.discountPaise ?? 0,
          chargesPaise: calc.doc?.chargesPaise ?? 0,
          charges: extras.charges,
          roundOffPaise: calc.tax.roundOffPaise ?? 0,
        },
        subtotalPaise: calc.tax.taxableValuePaise,
        taxPaise: calc.tax.totalTaxPaise,
        totalPaise: calc.tax.grandTotalPaise,
        items: calc.active.map((l, i) => ({
          description: (
            l.values.item_name ||
            l.values.description ||
            `Item ${i + 1}`
          ).trim(),
          productId: productByLine[l.key],
          qtyMilli: Math.round(lineQty(plan, l) * 1000),
          ratePaise: safePaise(l.values.rate),
          taxBps: calc.tax!.lines[i]?.rateBps ?? lineGstBps(plan, l) ?? 0,
          amountPaise: calc.tax!.lines[i]?.totalPaise ?? (0 as Paise),
          // coerceRecord drops keys the vertical does not declare, which would
          // throw away an HSN carried from the catalogue on the twelve
          // verticals with no HSN box. Re-added here, because HSN belongs on a
          // GST tax invoice regardless of which trade issued it.
          meta: withHsn(safeCoerce(config, l.values), l.values.hsn),
        })),
      });

      setLines([blankLine(config, plan)]);
      setProductByLine({});
      // Notes, discount and charges are per-bill; the shop's standing terms
      // are not, so they survive into the next invoice.
      setExtras((e) => ({ ...e, notes: "", discount: null, charges: [] }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!calc?.tax && (calc?.active.length ?? 0) > 0 && !saving;

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
        <QuickKeys orgId={orgId} onPick={addProductLine} />

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
                  {plan.fields.map((field) =>
                    field.key === "item_name" ? (
                      <ProductPicker
                        key={field.key}
                        field={field}
                        orgId={orgId}
                        value={line.values[field.key] ?? ""}
                        linked={Boolean(productByLine[line.key])}
                        onChange={(raw) => {
                          setLineValue(line.key, field.key, raw);
                          detachProduct(line.key);
                        }}
                        onPick={(product) => applyProduct(line.key, product)}
                      />
                    ) : (
                      <FieldControl
                        key={field.key}
                        field={field}
                        value={line.values[field.key] ?? ""}
                        onChange={(raw) =>
                          setLineValue(line.key, field.key, raw)
                        }
                      />
                    ),
                  )}
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

        <InvoiceExtras
          value={extras}
          onChange={setExtras}
          grossPaise={calc?.doc?.grossPaise ?? (0 as Paise)}
          discountPaise={calc?.doc?.discountPaise ?? (0 as Paise)}
          chargesPaise={calc?.doc?.chargesPaise ?? (0 as Paise)}
        />

        {calc?.tax ? (
          <div
            className="flex flex-col gap-1 border-t border-border pt-3"
            data-testid="totals"
          >
            {calc.doc && calc.doc.discountPaise > 0 ? (
              <Row
                label="Discount"
                value={`- ${formatPaise(calc.doc.discountPaise)}`}
              />
            ) : null}
            {calc.doc && calc.doc.chargesPaise > 0 ? (
              <Row
                label="Additional charges"
                value={formatPaise(calc.doc.chargesPaise)}
              />
            ) : null}
            <Row
              label="Taxable"
              value={formatPaise(calc.tax.taxableValuePaise)}
            />
            {calc.tax.igstPaise > 0 ? (
              <Row label="IGST" value={formatPaise(calc.tax.igstPaise)} />
            ) : (
              <>
                <Row label="CGST" value={formatPaise(calc.tax.cgstPaise)} />
                <Row label="SGST" value={formatPaise(calc.tax.sgstPaise)} />
              </>
            )}
            {calc.tax.roundOffPaise !== 0 ? (
              <Row
                label="Round off"
                value={formatPaise(calc.tax.roundOffPaise)}
              />
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

        <Button
          onClick={handleSave}
          disabled={!canSave}
          data-testid="save-invoice"
        >
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
          <Card
            className="divide-y divide-border p-0"
            data-testid="invoice-list"
          >
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
                  <Link
                    href={`/invoice/${inv.id}`}
                    className="text-caption font-medium text-primary hover:underline"
                  >
                    Print
                  </Link>
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
/**
 * Item name, backed by the shop's own catalogue.
 *
 * A combobox rather than a select: most shops have more products than a
 * dropdown can hold, and a line item must still accept a name that is not in
 * the catalogue at all — a one-off service, a repair charge, something bought
 * this morning. So free text always wins; the list is an offer, never a
 * requirement.
 *
 * The keyboard path is the one that matters. At a counter the fast way to bill
 * is type-three-letters, arrow-down, Enter, and never touch the mouse.
 */
function ProductPicker({
  field,
  orgId,
  value,
  linked,
  onChange,
  onPick,
}: {
  field: FieldDef;
  orgId: string;
  value: string;
  /** True once a catalogue product is behind this line. */
  linked: boolean;
  onChange: (raw: string) => void;
  onPick: (product: ProductPick) => void;
}) {
  const [matches, setMatches] = useState<ProductPick[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = `f-${field.key}`;
  const listId = `${id}-list`;

  useEffect(() => {
    if (!open) return;
    const term = value.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }

    // Debounced, and guarded by `live`: on a slow device the query for "cro"
    // can land after the query for "croc", and the older answer must not
    // overwrite the newer one.
    let live = true;
    const timer = setTimeout(() => {
      void searchProducts(orgId, term)
        .then((rows) => {
          if (!live) return;
          setMatches(rows);
          setActive(0);
        })
        .catch(() => {
          // A failed lookup is not a failed sale. The typed name still bills.
          if (live) setMatches([]);
        });
    }, 120);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [orgId, value, open]);

  const choose = (product: ProductPick) => {
    onPick(product);
    setOpen(false);
    setMatches([]);
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      // Only swallow Enter when a suggestion is actually highlighted, so the
      // key still submits for someone billing a name that is not in stock.
      event.preventDefault();
      const picked = matches[active];
      if (picked) choose(picked);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const labelText = field.label + (field.required ? " *" : "");

  return (
    <div className="relative col-span-2 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{labelText}</Label>
        {linked ? (
          <span
            data-testid="line-from-catalogue"
            className="text-caption normal-case text-success"
          >
            from catalogue
          </span>
        ) : null}
      </div>

      <Input
        id={id}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder="Type a name, SKU or HSN…"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Blur fires before click, so closing here would cancel the pick.
        // Options commit on mousedown instead, and this only tidies up after.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />

      {open && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          data-testid="product-matches"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-card"
        >
          {matches.map((product, i) => (
            <li key={product.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(product);
                }}
                onMouseEnter={() => setActive(i)}
                className={
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors " +
                  (i === active ? "bg-primary-tonal" : "hover:bg-canvas")
                }
              >
                <span className="text-body text-content">{product.name}</span>
                <span className="text-caption normal-case text-content-muted">
                  {[
                    product.sku ? `SKU ${product.sku}` : null,
                    product.hsn ? `HSN ${product.hsn}` : null,
                    product.tax_bps !== null
                      ? `${product.tax_bps / 100}% GST`
                      : null,
                    product.price_paise !== null
                      ? formatPaise(product.price_paise as Paise)
                      : null,
                    // Shown, never enforced here: "qty cannot exceed stock" is
                    // the metadata engine's rule to apply at save, not a reason
                    // to hide a product from the person holding it.
                    `${(product.on_hand_milli / 1000).toLocaleString("en-IN")} in stock`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open && value.trim().length >= 2 && matches.length === 0 ? (
        <p className="text-caption normal-case text-content-muted">
          Not in your catalogue — this will bill as a one-off item.
        </p>
      ) : null}
    </div>
  );
}

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
    field.label +
    (field.unit ? ` (${field.unit})` : "") +
    (field.required ? " *" : "");
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

/** Rupee string -> paise, tolerant of an empty, partial, or missing entry. */
function safePaise(rupees: string | undefined): Paise {
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

/**
 * The line values a catalogue product implies.
 *
 * Only writes what the product actually has — a product with no HSN recorded
 * must not blank an HSN the shopkeeper already typed. Everything written here
 * stays editable afterwards; this is a starting point, not a lock.
 *
 * Shared by the item-name picker and the quick keys so the two cannot drift
 * into filling a line differently.
 */
function fillFromProduct(
  current: Record<string, string>,
  product: ProductPick,
  plan: FieldPlan | null,
): Record<string, string> {
  // Annotated, not inferred: spreading a Record<string, string> into an
  // object literal narrows to just the literal's own keys, so the optional
  // writes below (hsn, rate, mrp, gst) have nowhere to land.
  const values: Record<string, string> = { ...current, item_name: product.name };

  // Carried whether or not this vertical renders an HSN box. Six of the
  // eighteen declare one; for the rest the value is invisible on screen but
  // still belongs on the tax invoice, and the print view reads it from meta.
  if (product.hsn) values.hsn = product.hsn;

  if (product.price_paise !== null) {
    values.rate = String(paiseToRupees(product.price_paise as Paise));
  }
  if (plan?.fields.some((f) => f.key === "mrp") && product.mrp_paise !== null) {
    values.mrp = String(paiseToRupees(product.mrp_paise as Paise));
  }
  if (plan?.hasGst && product.tax_bps !== null) {
    values.gst = String(product.tax_bps / 100);
  }
  return values;
}

/**
 * Puts the HSN back into a line's meta after coercion dropped it.
 *
 * `coerceRecord` deliberately keeps only the keys the vertical declares, which
 * is right for everything except this one: HSN is a GST requirement on the
 * invoice, not a per-trade preference, and only six of the eighteen verticals
 * declare a box for it.
 */
function withHsn(
  meta: Record<string, JsonValue>,
  hsn: string | undefined,
): Record<string, JsonValue> {
  const trimmed = hsn?.trim();
  if (!trimmed) return meta;
  return { ...meta, hsn: trimmed };
}
