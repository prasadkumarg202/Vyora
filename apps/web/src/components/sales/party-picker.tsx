"use client";

import { gstinStateCode, isValidGstin } from "@vyora/core";
import { Button, Input, Label } from "@vyora/ui";
import { useEffect, useRef, useState } from "react";

import {
  saveCustomer,
  searchCustomers,
  type CustomerPick,
} from "~/lib/db/repository";

/**
 * Bill To — who this invoice is for.
 *
 * Until this existed the till saved every invoice with customer_id NULL and
 * place of supply pinned to the shop's own state, so an out-of-state B2B sale
 * charged CGST+SGST where the law wants IGST. Picking the party is therefore not
 * decoration: it is the input the tax split is computed from.
 *
 * Place of supply is read from the first two digits of the customer's GSTIN
 * rather than from a state dropdown. A registered buyer's GSTIN already carries
 * their state of registration, and a second field to state it again is a second
 * field to get wrong. An unregistered walk-in has no GSTIN and no state to read,
 * which is correct — a counter sale is supplied where the counter is.
 *
 * The lookup runs against local SQLite so a regular can be billed by name with
 * no signal, and a customer created here is written locally and marked dirty
 * like every other local write.
 */

export interface Party {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  email: string | null;
}

export function PartyPicker({
  orgId,
  value,
  onChange,
  supplierStateCode,
}: {
  orgId: string;
  value: Party | null;
  onChange: (party: Party | null) => void;
  supplierStateCode: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced so a fast typist does not queue a query per keystroke, and gated
  // on two characters and an open list so a hidden dropdown never costs a
  // SQLite read — the same shape as the product lookup on the billing line.
  //
  // `live` guards the answer, because on a slow device the query for "ra" can
  // land after the query for "ram" and the older answer must not win. A failed
  // lookup is not a failed sale: it leaves the list empty and the shopkeeper
  // types the name.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchCustomers(orgId, term)
        .then((rows) => {
          if (live) setResults(rows);
        })
        .catch(() => {
          if (live) setResults([]);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [orgId, query, open]);

  // Close the suggestion list on an outside click, not on blur — blur fires
  // before the click lands on a suggestion and would swallow the pick.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(c: CustomerPick) {
    onChange({
      id: c.id,
      name: c.name,
      phone: c.phone,
      gstin: c.gstin,
      email: c.email,
    });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  if (adding) {
    return (
      <NewPartyForm
        orgId={orgId}
        initialName={query.trim()}
        onCancel={() => setAdding(false)}
        onCreated={(party) => {
          onChange(party);
          setAdding(false);
          setQuery("");
        }}
      />
    );
  }

  // --- Chosen -------------------------------------------------------------
  if (value) {
    const posCode = value.gstin ? gstinStateCode(value.gstin) : null;
    const interState = posCode !== null && posCode !== supplierStateCode;

    return (
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-caption uppercase text-content-muted">
              Bill to
            </span>
            <span className="text-body-lg font-semibold text-content">
              {value.name}
            </span>
            <span className="text-body text-content-muted">
              {value.phone ?? "No phone"}
              {value.email ? ` · ${value.email}` : ""}
            </span>
            <span className="text-body text-content-muted">
              {value.gstin ? `GSTIN ${value.gstin}` : "Unregistered (URD)"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>

        {/* Say plainly which way the tax will split, before the bill is saved. */}
        <p className="mt-3 border-t border-border pt-2 text-caption normal-case text-content-muted">
          {interState
            ? `Inter-state supply to ${posCode} — IGST applies.`
            : "Intra-state supply — CGST and SGST apply."}
        </p>
      </div>
    );
  }

  // --- Empty / searching ---------------------------------------------------
  return (
    <div ref={boxRef} className="relative">
      <div className="rounded-card border border-dashed border-border bg-surface p-4">
        <Label htmlFor="party-search">Bill to</Label>
        <Input
          id="party-search"
          value={query}
          autoComplete="off"
          placeholder="Search name, phone or GSTIN — leave blank for a walk-in"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="mt-1"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-caption normal-case text-content-muted">
            No party means a counter sale, taxed in your own state.
          </span>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            + New party
          </Button>
        </div>
      </div>

      {open && results.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Matching customers"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-border bg-surface shadow-overlay"
        >
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-primary-tonal"
              >
                <span className="flex flex-col">
                  <span className="text-body font-medium text-content">
                    {c.name}
                  </span>
                  <span className="text-caption normal-case text-content-muted">
                    {c.phone ?? "No phone"}
                    {c.gstin ? ` · ${c.gstin}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Create a party without leaving the bill. */
function NewPartyForm({
  orgId,
  initialName,
  onCreated,
  onCancel,
}: {
  orgId: string;
  initialName: string;
  onCreated: (party: Party) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("A party needs a name.");
      return;
    }
    const trimmedGstin = gstin.trim().toUpperCase();
    // Checked before saving, because a wrong GSTIN silently picks the wrong
    // place of supply and therefore the wrong tax split on every future bill.
    if (trimmedGstin && !isValidGstin(trimmedGstin)) {
      setError("That GSTIN does not look right — check the 15 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const trimmedPhone = phone.trim();
      const trimmedEmail = email.trim();

      await saveCustomer({
        id,
        orgId,
        name: trimmedName,
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        ...(trimmedGstin ? { gstin: trimmedGstin } : {}),
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      });

      onCreated({
        id,
        name: trimmedName,
        phone: trimmedPhone || null,
        gstin: trimmedGstin || null,
        email: trimmedEmail || null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <span className="text-caption uppercase text-content-muted">
        New party
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="np-name">Name *</Label>
          <Input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Party name"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="np-phone">Phone</Label>
          <Input
            id="np-phone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="For sending the bill on WhatsApp"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="np-email">Email</Label>
          <Input
            id="np-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="For mailing the bill"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="np-gstin">GSTIN</Label>
          <Input
            id="np-gstin"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="Leave blank if unregistered"
            className="font-mono"
          />
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={saving} size="sm">
          {saving ? "Saving…" : "Save party"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
