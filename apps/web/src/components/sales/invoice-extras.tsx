"use client";

import {
  formatPaise,
  rupeesToPaise,
  type DocumentCharge,
  type DocumentDiscount,
  type Paise,
} from "@vyora/core";
import { Button, Input, Label } from "@vyora/ui";
import { useEffect, useState } from "react";

import { getPreference } from "~/lib/settings";

/**
 * The parts of an invoice that are not line items: notes, terms, a
 * document-level discount, additional charges, and the round-off switch.
 *
 * All of it stays collapsed until asked for. A counter billing four packets of
 * salt should not scroll past an empty terms box to reach the total — but the
 * shop giving ₹200 off a ₹9,000 order should not have to fake it as a negative
 * line item either, which is what happens when a till has no discount field.
 *
 * The discount and the charges are only *captured* here. What they do to the
 * tax is `computeDocument`'s job, because a discount reduces taxable value and
 * a charge is taxed — neither is arithmetic that can be done after the fact
 * without the invoice disagreeing with the GST return.
 */

export interface Extras {
  notes: string;
  terms: string;
  discount: DocumentDiscount | null;
  charges: DocumentCharge[];
  roundOff: boolean;
}

export const emptyExtras: Extras = {
  notes: "",
  terms: "",
  discount: null,
  charges: [],
  roundOff: true,
};

export function InvoiceExtras({
  value,
  onChange,
  grossPaise,
  discountPaise,
  chargesPaise,
}: {
  value: Extras;
  onChange: (next: Extras) => void;
  grossPaise: Paise;
  discountPaise: Paise;
  chargesPaise: Paise;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">(
    "amount",
  );
  const [discountText, setDiscountText] = useState("");

  // The shop's standing notes, terms and round-off habit come from preferences,
  // so they are already right on the first bill rather than being set again
  // every time. Fetched together and applied in one update: three sequential
  // setStates against the same object would each overwrite the last.
  useEffect(() => {
    let live = true;
    void Promise.all([
      getPreference("invoiceNotes"),
      getPreference("invoiceTerms"),
      getPreference("roundOffTotal"),
    ]).then(([notes, terms, roundOff]) => {
      if (!live) return;
      onChange({
        ...value,
        // Empty preferences leave the field alone rather than blanking it.
        ...(notes ? { notes } : {}),
        ...(terms ? { terms } : {}),
        roundOff,
      });
    });
    return () => {
      live = false;
    };
    // Once, on mount: re-running would overwrite an edit the shop just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Extras>) => onChange({ ...value, ...patch });

  function applyDiscount(text: string, kind: "amount" | "percent") {
    setDiscountText(text);
    const trimmed = text.trim();
    if (!trimmed) return set({ discount: null });

    try {
      set({
        discount:
          kind === "percent"
            ? { kind: "percent", bps: Math.round(Number(trimmed) * 100) }
            : { kind: "amount", amountPaise: rupeesToPaise(trimmed) },
      });
    } catch {
      // Half-typed "12." is not an error, it is someone still typing.
      set({ discount: null });
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          on={showNotes}
          onClick={() => setShowNotes((v) => !v)}
          testId="toggle-notes"
        >
          {showNotes ? "Hide notes" : "+ Add notes"}
        </Toggle>
        <Toggle
          on={showTerms}
          onClick={() => setShowTerms((v) => !v)}
          testId="toggle-terms"
        >
          {showTerms ? "Hide terms" : "+ Add terms & conditions"}
        </Toggle>
        <label className="ml-auto flex min-h-touch items-center gap-2">
          <input
            type="checkbox"
            checked={value.roundOff}
            onChange={(e) => set({ roundOff: e.target.checked })}
            data-testid="round-off"
            className="h-4 w-4 accent-primary"
          />
          <span className="text-body text-content">Auto round off</span>
        </label>
      </div>

      {showNotes ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-notes">Notes</Label>
          <textarea
            id="invoice-notes"
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={2}
            placeholder="Delivery on Monday · Vehicle TS09 AB 1234"
            className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          />
        </div>
      ) : null}

      {showTerms ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-terms">Terms and conditions</Label>
          <textarea
            id="invoice-terms"
            value={value.terms}
            onChange={(e) => set({ terms: e.target.value })}
            rows={3}
            className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          />
          <span className="text-caption normal-case text-content-muted">
            Saved as your default in Settings — change it there once and every
            invoice follows.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount">Discount on the bill</Label>
          <div className="flex gap-2">
            <Input
              id="discount"
              value={discountText}
              onChange={(e) => applyDiscount(e.target.value, discountKind)}
              inputMode="decimal"
              placeholder="0"
              data-testid="discount-input"
            />
            <select
              aria-label="Discount type"
              value={discountKind}
              onChange={(e) => {
                const kind = e.target.value as "amount" | "percent";
                setDiscountKind(kind);
                applyDiscount(discountText, kind);
              }}
              className="min-h-touch rounded-input border border-border bg-surface px-2 text-body text-content"
            >
              <option value="amount">₹</option>
              <option value="percent">%</option>
            </select>
          </div>
          {discountPaise > 0 ? (
            <span
              data-testid="discount-applied"
              className="text-caption normal-case text-content-muted"
            >
              {formatPaise(discountPaise)} off {formatPaise(grossPaise)} — taken
              off the taxable value, so the GST drops with it.
            </span>
          ) : null}
        </div>

        <ChargeEditor
          charges={value.charges}
          onChange={(charges) => set({ charges })}
          totalPaise={chargesPaise}
        />
      </div>
    </div>
  );
}

function ChargeEditor({
  charges,
  onChange,
  totalPaise,
}: {
  charges: DocumentCharge[];
  onChange: (next: DocumentCharge[]) => void;
  totalPaise: Paise;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  function add() {
    const name = label.trim();
    const text = amount.trim();
    if (!name || !text) return;
    try {
      onChange([...charges, { label: name, amountPaise: rupeesToPaise(text) }]);
      setLabel("");
      setAmount("");
    } catch {
      // Not a rupee amount — leave the inputs alone so it can be corrected.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="charge-label">Additional charges</Label>

      {charges.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {charges.map((charge, i) => (
            <li
              key={`${charge.label}-${i}`}
              data-testid="charge-row"
              className="flex items-center gap-2 rounded-control bg-canvas px-2 py-1"
            >
              <span className="flex-1 text-body">{charge.label}</span>
              <span className="font-mono text-body">
                {formatPaise(charge.amountPaise)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${charge.label}`}
                onClick={() => onChange(charges.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Input
          id="charge-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Delivery"
        />
        <Input
          aria-label="Charge amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          inputMode="decimal"
          placeholder="₹"
          className="w-24"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={add}
          data-testid="add-charge"
        >
          Add
        </Button>
      </div>

      {totalPaise > 0 ? (
        <span className="text-caption normal-case text-content-muted">
          {formatPaise(totalPaise)} in charges — taxed at the highest rate on
          this bill, as a composite supply.
        </span>
      ) : null}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
  testId,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={on}
      data-testid={testId}
      className="text-body font-medium text-primary hover:underline"
    >
      {children}
    </button>
  );
}
