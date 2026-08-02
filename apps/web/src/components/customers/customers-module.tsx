"use client";

import { type BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listCustomers,
  saveCustomer,
  type CustomerRow,
} from "~/lib/db/repository";

/**
 * The Customers directory (route: /customers).
 *
 * Offline-first like every write: a customer added here commits to the local
 * DB immediately (dirty=1) and syncs in the background. Phone and GSTIN are the
 * fields the transactional modules need to attach a customer to an invoice and
 * decide place-of-supply for GST. Statements and outstanding-per-customer read
 * from invoices and land with the ledger view (a later enhancement).
 */
export function CustomersModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  const refresh = useCallback(async () => {
    try {
      setRows(await listCustomers(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.gstin ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function handleCreate() {
    if (name.trim().length < 1) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedPhone = phone.trim();
      const trimmedGstin = gstin.trim().toUpperCase();
      await saveCustomer({
        id: crypto.randomUUID(),
        orgId,
        name: name.trim(),
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        ...(trimmedGstin ? { gstin: trimmedGstin } : {}),
      });
      setName("");
      setPhone("");
      setGstin("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Customers</h1>
          <p className="text-body text-content-muted">
            Everyone you sell to — used across Sales, Payments and GST.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-5 flex flex-col gap-1">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer or business name"
            />
          </div>
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="c-phone">Phone</Label>
            <Input
              id="c-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
              className="font-mono"
              placeholder="optional"
            />
          </div>
          <div className="col-span-4 flex flex-col gap-1">
            <Label htmlFor="c-gstin">GSTIN</Label>
            <Input
              id="c-gstin"
              value={gstin}
              onChange={(e) =>
                setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))
              }
              maxLength={15}
              className="font-mono uppercase"
              placeholder="optional · 15 chars"
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

        <Button
          onClick={handleCreate}
          disabled={saving || name.trim().length < 1}
          data-testid="add-customer"
          className="self-start"
        >
          {saving ? "Adding…" : "Add customer"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-h3">Directory</h2>
          <Input
            aria-label="Search customers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone or GSTIN…"
            className="max-w-xs"
          />
        </div>

        {filtered === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query ? "No matches" : "No customers yet"}
            description={
              query
                ? "No customer matches that search."
                : "Add your first customer above — it stays on this device and syncs when you reconnect."
            }
          />
        ) : (
          <Card className="p-0" data-testid="customer-list">
            <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-medium uppercase text-content-muted">
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Phone</span>
              <span className="col-span-4">GSTIN</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3"
                  data-testid="customer-row"
                >
                  <span className="col-span-5 flex items-center gap-2 text-body font-medium">
                    {c.name}
                    {c.dirty ? (
                      <Badge tone="warning" dot>
                        Unsynced
                      </Badge>
                    ) : null}
                  </span>
                  <span className="col-span-3 font-mono text-body text-content-muted">
                    {c.phone ?? "—"}
                  </span>
                  <span className="col-span-4 font-mono text-body text-content-muted">
                    {c.gstin ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
