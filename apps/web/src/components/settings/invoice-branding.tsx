"use client";

import { Button, Card, Input, Label } from "@vyora/ui";
import { useEffect, useState } from "react";

import { getSetting, setSetting } from "~/lib/db/repository";

/**
 * Invoice branding — the shop identity printed on every invoice.
 *
 * Address, GSTIN, phone and a footer line (terms, thank-you note, bank
 * details). Saved on-device in sync_state like PaymentSettings; the printable
 * invoice reads these at render time, so it works fully offline.
 */
export function InvoiceBranding() {
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [footer, setFooter] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setAddress((await getSetting("shop_address")) ?? "");
      setGstin((await getSetting("shop_gstin")) ?? "");
      setPhone((await getSetting("shop_phone")) ?? "");
      setFooter((await getSetting("invoice_footer")) ?? "");
    })();
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await setSetting("shop_address", address.trim());
      await setSetting("shop_gstin", gstin.trim().toUpperCase());
      await setSetting("shop_phone", phone.trim());
      await setSetting("invoice_footer", footer.trim());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Invoice branding</h2>
        <p className="text-body text-content-muted">
          Printed in the header and footer of every invoice — make the bill
          unmistakably yours.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="brand-address">Shop address</Label>
          <Input id="brand-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Main Bazaar Road, Visakhapatnam 530001" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="brand-gstin">GSTIN</Label>
          <Input id="brand-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="37ABCDE1234F1Z5" className="font-mono uppercase" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="brand-phone">Shop phone</Label>
          <Input id="brand-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="brand-footer">Invoice footer line</Label>
          <Input id="brand-footer" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Goods once sold will not be taken back · Thank you, visit again!" />
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
