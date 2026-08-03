"use client";

import { Button } from "@vyora/ui";
import Link from "next/link";
import { useState } from "react";

import { exportCustomers, exportProducts } from "~/lib/db/repository";
import { datedFilename, downloadCsv, toCsv } from "~/lib/import/csv";

/**
 * Import / Export buttons where the data actually lives.
 *
 * A shop owner looking at an empty Products screen is exactly the person who
 * needs bulk import, and the person who wants a copy of the list is looking at
 * the list. Burying both in a menu elsewhere is why people believe billing apps
 * "can't" do it — so the actions sit on the module itself.
 */
export function ModuleDataActions({
  module,
  orgId,
}: {
  module: "products" | "customers";
  orgId: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      if (module === "products") {
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
      } else {
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
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/import"
        className="rounded-control border border-border bg-surface px-3 py-1.5 text-caption font-medium text-primary hover:bg-canvas"
      >
        ⬆ Bulk import
      </Link>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
        {busy ? "Preparing…" : "⬇ Export CSV"}
      </Button>
    </div>
  );
}
