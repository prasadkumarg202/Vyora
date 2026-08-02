"use client";

import { Button, Card, Input, Label } from "@vyora/ui";
import { useEffect, useState } from "react";

import { getSetting, setSetting } from "~/lib/db/repository";

/**
 * Payment settings — the shop's UPI id and display name, saved on-device.
 *
 * These drive the "Pay via UPI" button and QR on every invoice. Kept local
 * (sync_state) for now; they move to the synced business profile when it lands.
 */
export function PaymentSettings() {
  const [upiId, setUpiId] = useState("");
  const [shop, setShop] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setUpiId((await getSetting("upi_id")) ?? "");
      setShop((await getSetting("shop_name")) ?? "");
    })();
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await setSetting("upi_id", upiId.trim());
      await setSetting("shop_name", shop.trim());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Payments</h2>
        <p className="text-body text-content-muted">
          Add your UPI ID to put a “Pay via UPI” button and a scannable QR on every invoice.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="upi">UPI ID</Label>
          <Input id="upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourshop@okhdfcbank" className="font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="shop">Shop name (on QR)</Label>
          <Input id="shop" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="Sri Sai Medicals" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy} className="self-start">
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved ? <span className="text-caption normal-case text-success">Saved on this device.</span> : null}
      </div>
    </Card>
  );
}
