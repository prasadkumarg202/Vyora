"use client";

import { getPreference } from "~/lib/settings";

import { all } from "./client";
import { ready } from "./repository";

/**
 * The report engine.
 *
 * Every report is one function returning the same shape — columns, rows, and
 * optional totals — so the screen that renders them, searches them, sorts them,
 * prints them and exports them is written once. Adding a report is adding a
 * query, not a page.
 *
 * All of it runs against the on-device database, so a shopkeeper can pull a
 * year's sales register standing in a shop with no signal.
 */

export type Align = "left" | "right";

export interface ReportColumn {
  key: string;
  label: string;
  align?: Align;
  /** Paise -> ₹ at render time; kept as integers here so totals stay exact. */
  money?: boolean;
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  /** Column key -> total. Rendered as a sticky footer row. */
  totals?: Record<string, number>;
  note?: string;
}

export interface ReportArgs {
  orgId: string;
  from: string;
  to: string;
  partyId?: string;
}

export type ReportId =
  | "all-transactions"
  | "cash-flow"
  | "party-outstanding"
  | "party-statement"
  | "stock-summary"
  | "low-stock"
  | "item-sales"
  | "item-profit"
  | "hsn-summary"
  | "gst-rate"
  | "expense-category"
  | "bank-statement"
  | "loan-statement";

export interface ReportMeta {
  id: ReportId;
  group: string;
  title: string;
  blurb: string;
  /** Reports that read a single party need the picker shown. */
  needsParty?: boolean;
  /** Some views are a snapshot of *now*, not a period. */
  ignoresDates?: boolean;
}

export const REPORTS: ReportMeta[] = [
  { id: "all-transactions", group: "Transactions", title: "All transactions", blurb: "Every sale, purchase, payment and expense in one ledger." },
  { id: "cash-flow", group: "Transactions", title: "Cash flow", blurb: "Money in against money out, and what it left behind." },
  { id: "party-outstanding", group: "Parties", title: "Party outstanding", blurb: "Who owes you, oldest first, with ageing.", ignoresDates: true },
  { id: "party-statement", group: "Parties", title: "Party statement", blurb: "One customer's bills and payments, as a running account.", needsParty: true },
  { id: "stock-summary", group: "Stock", title: "Stock summary", blurb: "What is on the shelf and what it is worth.", ignoresDates: true },
  { id: "low-stock", group: "Stock", title: "Low stock", blurb: "What has run out or is about to.", ignoresDates: true },
  { id: "item-sales", group: "Stock", title: "Item-wise sales", blurb: "Quantity and value sold, per item." },
  { id: "item-profit", group: "Stock", title: "Item-wise profit", blurb: "Margin per item, using your average purchase cost." },
  { id: "hsn-summary", group: "GST", title: "Sales by HSN", blurb: "Taxable value and tax per HSN code — the GSTR-1 table." },
  { id: "gst-rate", group: "GST", title: "Sales by GST rate", blurb: "How much sold at each slab, and the tax on it." },
  { id: "expense-category", group: "Expenses", title: "Expenses by category", blurb: "Where the money went, grouped." },
  { id: "bank-statement", group: "Cash & bank", title: "Account statement", blurb: "Every movement through cash and bank accounts." },
  { id: "loan-statement", group: "Cash & bank", title: "Loan statement", blurb: "Borrowings and repayments, with the balance left." },
];

const sum = (rows: Record<string, string | number | null>[], key: string): number =>
  rows.reduce((t, r) => t + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

const milliToQty = (milli: number): number => Math.round(milli) / 1000;

export async function runReport(id: ReportId, args: ReportArgs): Promise<ReportTable> {
  await ready();
  const { orgId, from, to } = args;

  switch (id) {
    // ---- Transactions ----------------------------------------------------
    case "all-transactions": {
      // One ledger from four sources. UNION ALL, not UNION: two genuine
      // transactions of the same value on the same day must both survive.
      const rows = await all<Record<string, string | number | null>>(
        `SELECT i.date AS date, 'Sale' AS type, i.number AS ref,
                COALESCE(c.name, 'Walk-in') AS party, i.total_paise AS amount,
                i.status AS status
           FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.org_id = ? AND i.deleted_at IS NULL AND i.date BETWEEN ? AND ?
         UNION ALL
         SELECT p.date, 'Purchase', p.number, COALESCE(s.name, '—'),
                -p.total_paise, p.status
           FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.org_id = ? AND p.deleted_at IS NULL AND p.date BETWEEN ? AND ?
         UNION ALL
         SELECT pay.date,
                CASE WHEN pay.direction = 'in' THEN 'Payment in' ELSE 'Payment out' END,
                pay.method, COALESCE(c2.name, s2.name, '—'),
                CASE WHEN pay.direction = 'in' THEN pay.amount_paise ELSE -pay.amount_paise END,
                ''
           FROM payments pay
                LEFT JOIN customers c2 ON c2.id = pay.party_id
                LEFT JOIN suppliers s2 ON s2.id = pay.party_id
          WHERE pay.org_id = ? AND pay.deleted_at IS NULL AND pay.date BETWEEN ? AND ?
         UNION ALL
         SELECT e.date, 'Expense', COALESCE(e.category, 'General'), COALESCE(e.note, '—'),
                -e.amount_paise, ''
           FROM expenses e
          WHERE e.org_id = ? AND e.deleted_at IS NULL AND e.date BETWEEN ? AND ?
         ORDER BY date DESC`,
        [orgId, from, to, orgId, from, to, orgId, from, to, orgId, from, to],
      );
      return {
        columns: [
          { key: "date", label: "Date" },
          { key: "type", label: "Type" },
          { key: "ref", label: "Reference" },
          { key: "party", label: "Party" },
          { key: "amount", label: "Amount", align: "right", money: true },
        ],
        rows,
        totals: { amount: sum(rows, "amount") },
        note: "Money in is positive, money out negative — the total is the net movement.",
      };
    }

    case "cash-flow": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT 'Collected from customers' AS head,
                COALESCE(SUM(amount_paise),0) AS inflow, 0 AS outflow
           FROM payments WHERE org_id = ? AND deleted_at IS NULL
             AND direction = 'in' AND date BETWEEN ? AND ?
         UNION ALL
         SELECT 'Paid to suppliers', 0, COALESCE(SUM(amount_paise),0)
           FROM payments WHERE org_id = ? AND deleted_at IS NULL
             AND direction = 'out' AND date BETWEEN ? AND ?
         UNION ALL
         SELECT 'Expenses', 0, COALESCE(SUM(amount_paise),0)
           FROM expenses WHERE org_id = ? AND deleted_at IS NULL AND date BETWEEN ? AND ?
         UNION ALL
         SELECT 'Other money in', COALESCE(SUM(amount_paise),0), 0
           FROM account_entries WHERE org_id = ? AND deleted_at IS NULL
             AND direction = 'in' AND COALESCE(category,'') <> 'transfer'
             AND (cheque_status IS NULL OR cheque_status = 'cleared')
             AND date BETWEEN ? AND ?
         UNION ALL
         SELECT 'Other money out', 0, COALESCE(SUM(amount_paise),0)
           FROM account_entries WHERE org_id = ? AND deleted_at IS NULL
             AND direction = 'out' AND COALESCE(category,'') <> 'transfer'
             AND (cheque_status IS NULL OR cheque_status = 'cleared')
             AND date BETWEEN ? AND ?`,
        [orgId, from, to, orgId, from, to, orgId, from, to, orgId, from, to, orgId, from, to],
      );
      const inflow = sum(rows, "inflow");
      const outflow = sum(rows, "outflow");
      return {
        columns: [
          { key: "head", label: "Head" },
          { key: "inflow", label: "In", align: "right", money: true },
          { key: "outflow", label: "Out", align: "right", money: true },
        ],
        rows: [...rows, { head: "Net movement", inflow: inflow - outflow, outflow: 0 }],
        totals: { inflow, outflow },
        note: "Transfers between your own accounts are excluded — moving money is not earning it.",
      };
    }

    // ---- Parties ---------------------------------------------------------
    case "party-outstanding": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT COALESCE(c.name,'Walk-in') AS party, c.phone AS phone,
                COUNT(*) AS bills,
                SUM(i.total_paise - i.amount_paid_paise) AS due,
                MIN(i.date) AS oldest,
                CAST(julianday('now') - julianday(MIN(i.date)) AS INTEGER) AS days
           FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.org_id = ? AND i.deleted_at IS NULL
            AND i.amount_paid_paise < i.total_paise
          GROUP BY i.customer_id
          ORDER BY days DESC`,
        [orgId],
      );
      return {
        columns: [
          { key: "party", label: "Party" },
          { key: "phone", label: "Phone" },
          { key: "bills", label: "Bills", align: "right" },
          { key: "oldest", label: "Oldest bill" },
          { key: "days", label: "Days", align: "right" },
          { key: "due", label: "Outstanding", align: "right", money: true },
        ],
        rows,
        totals: { due: sum(rows, "due") },
      };
    }

    case "party-statement": {
      if (!args.partyId) return { columns: [], rows: [], note: "Choose a party above." };
      const rows = await all<Record<string, string | number | null>>(
        `SELECT i.date AS date, 'Invoice' AS particulars, i.number AS ref,
                i.total_paise AS debit, 0 AS credit
           FROM invoices i
          WHERE i.org_id = ? AND i.customer_id = ? AND i.deleted_at IS NULL
         UNION ALL
         SELECT p.date, CASE WHEN p.method = 'credit-note' THEN 'Credit note' ELSE 'Payment received' END,
                p.method, 0, p.amount_paise
           FROM payments p
          WHERE p.org_id = ? AND p.party_id = ? AND p.direction = 'in' AND p.deleted_at IS NULL
         ORDER BY date ASC`,
        [orgId, args.partyId, orgId, args.partyId],
      );
      // Running balance is the point of a statement — compute it in order.
      let balance = 0;
      const withBalance = rows.map((r) => {
        balance += (r.debit as number) - (r.credit as number);
        return { ...r, balance };
      });
      return {
        columns: [
          { key: "date", label: "Date" },
          { key: "particulars", label: "Particulars" },
          { key: "ref", label: "Reference" },
          { key: "debit", label: "Billed", align: "right", money: true },
          { key: "credit", label: "Received", align: "right", money: true },
          { key: "balance", label: "Balance", align: "right", money: true },
        ],
        rows: withBalance,
        totals: { debit: sum(rows, "debit"), credit: sum(rows, "credit") },
        note: "Whole history, not just the chosen period — a statement that starts mid-story is worse than none.",
      };
    }

    // ---- Stock -----------------------------------------------------------
    case "stock-summary": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT p.name AS item, p.sku AS sku, p.hsn AS hsn,
                COALESCE((SELECT SUM(m.qty_milli) FROM stock_movements m
                           WHERE m.product_id = p.id AND m.deleted_at IS NULL),0) AS qty_milli,
                p.price_paise AS rate,
                CAST(COALESCE((SELECT SUM(m.qty_milli) FROM stock_movements m
                           WHERE m.product_id = p.id AND m.deleted_at IS NULL),0)
                     * COALESCE(p.price_paise,0) / 1000 AS INTEGER) AS value
           FROM products p
          WHERE p.org_id = ? AND p.deleted_at IS NULL
          ORDER BY value DESC`,
        [orgId],
      );
      const mapped = rows.map((r) => ({ ...r, qty: milliToQty(r.qty_milli as number) }));
      return {
        columns: [
          { key: "item", label: "Item" },
          { key: "sku", label: "SKU" },
          { key: "hsn", label: "HSN" },
          { key: "qty", label: "In stock", align: "right" },
          { key: "rate", label: "Rate", align: "right", money: true },
          { key: "value", label: "Stock value", align: "right", money: true },
        ],
        rows: mapped,
        totals: { value: sum(mapped, "value") },
        note: "Valued at your selling price.",
      };
    }

    case "low-stock": {
      const rows = await all<Record<string, string | number | null>>(
        // HAVING needs a GROUP BY; the level is a correlated subquery, so the
        // filter goes outside in a wrapper rather than being computed twice.
        `SELECT * FROM (
           SELECT p.name AS item, p.sku AS sku,
                  COALESCE((SELECT SUM(m.qty_milli) FROM stock_movements m
                             WHERE m.product_id = p.id AND m.deleted_at IS NULL),0) AS qty_milli,
                  (SELECT MAX(i.date) FROM invoice_items ii
                     JOIN invoices i ON i.id = ii.invoice_id
                    WHERE ii.product_id = p.id AND i.deleted_at IS NULL) AS last_sold
             FROM products p
            WHERE p.org_id = ? AND p.deleted_at IS NULL
         )
         WHERE qty_milli <= ?
         ORDER BY qty_milli ASC`,
        [orgId, (await getPreference("lowStockThreshold")) * 1000],
      );
      return {
        columns: [
          { key: "item", label: "Item" },
          { key: "sku", label: "SKU" },
          { key: "qty", label: "Left", align: "right" },
          { key: "last_sold", label: "Last sold" },
        ],
        rows: rows.map((r) => ({ ...r, qty: milliToQty(r.qty_milli as number) })),
        note: "Threshold comes from Settings — change it there and this list follows.",
      };
    }

    case "item-sales": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT COALESCE(p.name, ii.description, 'Item') AS item,
                SUM(ii.qty_milli) AS qty_milli,
                SUM(ii.amount_paise) AS value,
                COUNT(DISTINCT i.id) AS bills
           FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                LEFT JOIN products p ON p.id = ii.product_id
          WHERE ii.org_id = ? AND i.deleted_at IS NULL AND i.date BETWEEN ? AND ?
          GROUP BY COALESCE(p.name, ii.description)
          ORDER BY value DESC`,
        [orgId, from, to],
      );
      const mapped = rows.map((r) => ({ ...r, qty: milliToQty(r.qty_milli as number) }));
      return {
        columns: [
          { key: "item", label: "Item" },
          { key: "bills", label: "Bills", align: "right" },
          { key: "qty", label: "Qty sold", align: "right" },
          { key: "value", label: "Value", align: "right", money: true },
        ],
        rows: mapped,
        totals: { value: sum(mapped, "value") },
      };
    }

    case "item-profit": {
      // Cost is the average you actually paid, from your own purchase lines —
      // not a field somebody had to remember to fill in.
      const rows = await all<Record<string, string | number | null>>(
        `SELECT p.name AS item,
                SUM(ii.qty_milli) AS qty_milli,
                SUM(ii.amount_paise) AS revenue,
                (SELECT CASE WHEN SUM(pi.qty_milli) > 0
                             THEN SUM(pi.amount_paise) * 1000 / SUM(pi.qty_milli)
                             ELSE NULL END
                   FROM purchase_items pi WHERE pi.product_id = p.id) AS avg_cost
           FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                JOIN products p ON p.id = ii.product_id
          WHERE ii.org_id = ? AND i.deleted_at IS NULL AND i.date BETWEEN ? AND ?
          GROUP BY p.id
          ORDER BY revenue DESC`,
        [orgId, from, to],
      );
      const mapped = rows.map((r) => {
        const qtyMilli = r.qty_milli as number;
        const avgCost = r.avg_cost as number | null;
        const cost = avgCost == null ? null : Math.round((avgCost * qtyMilli) / 1000);
        const revenue = r.revenue as number;
        return {
          item: r.item,
          qty: milliToQty(qtyMilli),
          revenue,
          cost,
          profit: cost == null ? null : revenue - cost,
          margin: cost == null || revenue === 0 ? "—" : `${Math.round(((revenue - cost) / revenue) * 100)}%`,
        };
      });
      return {
        columns: [
          { key: "item", label: "Item" },
          { key: "qty", label: "Qty sold", align: "right" },
          { key: "revenue", label: "Revenue", align: "right", money: true },
          { key: "cost", label: "Cost", align: "right", money: true },
          { key: "profit", label: "Profit", align: "right", money: true },
          { key: "margin", label: "Margin", align: "right" },
        ],
        rows: mapped,
        totals: { revenue: sum(mapped, "revenue"), cost: sum(mapped, "cost"), profit: sum(mapped, "profit") },
        note: "Cost is the average of what you paid for that item across all purchases. Items never purchased in Vyora show no margin.",
      };
    }

    // ---- GST -------------------------------------------------------------
    case "hsn-summary": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT COALESCE(NULLIF(p.hsn,''),'Not set') AS hsn,
                SUM(ii.qty_milli) AS qty_milli,
                SUM(ii.amount_paise) AS total,
                CAST(SUM(ii.amount_paise * 10000 / (10000 + ii.tax_bps)) AS INTEGER) AS taxable
           FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                LEFT JOIN products p ON p.id = ii.product_id
          WHERE ii.org_id = ? AND i.deleted_at IS NULL AND i.date BETWEEN ? AND ?
          GROUP BY COALESCE(NULLIF(p.hsn,''),'Not set')
          ORDER BY total DESC`,
        [orgId, from, to],
      );
      const mapped = rows.map((r) => ({
        hsn: r.hsn,
        qty: milliToQty(r.qty_milli as number),
        taxable: r.taxable as number,
        tax: (r.total as number) - (r.taxable as number),
        total: r.total as number,
      }));
      return {
        columns: [
          { key: "hsn", label: "HSN" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "taxable", label: "Taxable value", align: "right", money: true },
          { key: "tax", label: "Tax", align: "right", money: true },
          { key: "total", label: "Total", align: "right", money: true },
        ],
        rows: mapped,
        totals: { taxable: sum(mapped, "taxable"), tax: sum(mapped, "tax"), total: sum(mapped, "total") },
        note: "The shape GSTR-1 asks for. Items with no HSN are grouped so you can spot and fix them.",
      };
    }

    case "gst-rate": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT ii.tax_bps AS bps,
                SUM(ii.amount_paise) AS total,
                CAST(SUM(ii.amount_paise * 10000 / (10000 + ii.tax_bps)) AS INTEGER) AS taxable,
                COUNT(DISTINCT i.id) AS bills
           FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.org_id = ? AND i.deleted_at IS NULL AND i.date BETWEEN ? AND ?
          GROUP BY ii.tax_bps
          ORDER BY ii.tax_bps`,
        [orgId, from, to],
      );
      const mapped = rows.map((r) => ({
        rate: `${(r.bps as number) / 100}%`,
        bills: r.bills as number,
        taxable: r.taxable as number,
        tax: (r.total as number) - (r.taxable as number),
        total: r.total as number,
      }));
      return {
        columns: [
          { key: "rate", label: "GST rate" },
          { key: "bills", label: "Bills", align: "right" },
          { key: "taxable", label: "Taxable value", align: "right", money: true },
          { key: "tax", label: "Tax", align: "right", money: true },
          { key: "total", label: "Total", align: "right", money: true },
        ],
        rows: mapped,
        totals: { taxable: sum(mapped, "taxable"), tax: sum(mapped, "tax"), total: sum(mapped, "total") },
      };
    }

    // ---- Expenses --------------------------------------------------------
    case "expense-category": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT COALESCE(NULLIF(category,''),'Uncategorised') AS category,
                COUNT(*) AS entries, SUM(amount_paise) AS amount
           FROM expenses
          WHERE org_id = ? AND deleted_at IS NULL AND date BETWEEN ? AND ?
          GROUP BY COALESCE(NULLIF(category,''),'Uncategorised')
          ORDER BY amount DESC`,
        [orgId, from, to],
      );
      return {
        columns: [
          { key: "category", label: "Category" },
          { key: "entries", label: "Entries", align: "right" },
          { key: "amount", label: "Spent", align: "right", money: true },
        ],
        rows,
        totals: { amount: sum(rows, "amount") },
      };
    }

    // ---- Cash & bank -----------------------------------------------------
    case "bank-statement": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT e.date AS date, a.name AS account,
                COALESCE(e.note, e.category, 'Movement') AS particulars,
                CASE WHEN e.direction = 'in' THEN e.amount_paise ELSE 0 END AS credit,
                CASE WHEN e.direction = 'out' THEN e.amount_paise ELSE 0 END AS debit,
                COALESCE(e.cheque_status,'') AS status
           FROM account_entries e LEFT JOIN accounts a ON a.id = e.account_id
          WHERE e.org_id = ? AND e.deleted_at IS NULL AND e.date BETWEEN ? AND ?
            AND a.kind <> 'loan'
          ORDER BY e.date DESC, e.updated_at DESC`,
        [orgId, from, to],
      );
      return {
        columns: [
          { key: "date", label: "Date" },
          { key: "account", label: "Account" },
          { key: "particulars", label: "Particulars" },
          { key: "status", label: "Status" },
          { key: "credit", label: "In", align: "right", money: true },
          { key: "debit", label: "Out", align: "right", money: true },
        ],
        rows,
        totals: { credit: sum(rows, "credit"), debit: sum(rows, "debit") },
      };
    }

    case "loan-statement": {
      const rows = await all<Record<string, string | number | null>>(
        `SELECT e.date AS date, a.name AS loan,
                COALESCE(e.note, e.category, '—') AS particulars,
                CASE WHEN e.direction = 'in' THEN e.amount_paise ELSE 0 END AS borrowed,
                CASE WHEN e.direction = 'out' THEN e.amount_paise ELSE 0 END AS repaid
           FROM account_entries e JOIN accounts a ON a.id = e.account_id
          WHERE e.org_id = ? AND e.deleted_at IS NULL AND a.kind = 'loan'
          ORDER BY e.date ASC`,
        [orgId],
      );
      let balance = 0;
      const withBalance = rows.map((r) => {
        balance += (r.borrowed as number) - (r.repaid as number);
        return { ...r, balance };
      });
      return {
        columns: [
          { key: "date", label: "Date" },
          { key: "loan", label: "Loan" },
          { key: "particulars", label: "Particulars" },
          { key: "borrowed", label: "Borrowed", align: "right", money: true },
          { key: "repaid", label: "Repaid", align: "right", money: true },
          { key: "balance", label: "Still owed", align: "right", money: true },
        ],
        rows: withBalance,
        totals: { borrowed: sum(rows, "borrowed"), repaid: sum(rows, "repaid") },
        note: "Full history, so the closing balance is the truth rather than a slice of it.",
      };
    }
  }
}
