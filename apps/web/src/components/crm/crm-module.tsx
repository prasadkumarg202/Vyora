"use client";

import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listCustomers,
  saveCustomer,
  type CustomerRow,
} from "~/lib/db/repository";

/**
 * The CRM module — the customer directory.
 *
 * Customers are added and listed on-device, offline-first, like every write in
 * the app: the row is marked dirty until the sync engine flushes it, and the
 * list shows that state so a shopkeeper knows what is still only on this phone.
 * Search filters the already-loaded list on the client — no round-trip, so it
 * works with no network.
 */

export function CrmModule({ orgId }: { orgId: string }) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New-customer draft.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  // Search box, filtering the loaded list by name or phone.
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      setCustomers(await listCustomers(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    if (name.trim().length < 1) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedPhone = phone.trim();
      const trimmedGstin = gstin.trim();
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

  const filtered = useMemo(() => {
    if (customers === null) return null;
    const q = query.trim().toLowerCase();
    if (q.length === 0) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Customers</h1>
        <p className="text-body text-content-muted">
          Your customer directory — on this device, connected or not.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-5 flex flex-col gap-1">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
          </div>
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
          </div>
          <div className="col-span-4 flex flex-col gap-1">
            <Label htmlFor="c-gstin">GSTIN</Label>
            <Input id="c-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="optional" />
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}

        <Button onClick={handleCreate} disabled={saving || name.trim().length < 1} data-testid="add-customer" className="self-start">
          {saving ? "Adding…" : "Add customer"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3">Directory</h2>
          <Input
            aria-label="Search customers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone"
            className="w-64"
            data-testid="search-customers"
          />
        </div>
        {filtered === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add a customer above — they stay on this device until synced."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="customer-list">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 p-4" data-testid="customer-row">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{c.name}</span>
                  <span className="text-caption normal-case text-content-muted">
                    {c.phone ?? "—"}
                  </span>
                </div>
                {c.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
