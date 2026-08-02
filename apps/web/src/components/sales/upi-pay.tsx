"use client";

import { formatPaise, type Paise } from "@vyora/core";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getSetting } from "~/lib/db/repository";

/**
 * UPI collection on an invoice — the fastest way an Indian shop gets paid.
 *
 * Renders a `upi://pay` deep link (opens GPay/PhonePe/Paytm on the customer's
 * phone) and a scannable QR with the exact amount pre-filled. The UPI id and
 * shop name are read from device settings. Everything is generated on-device,
 * so it prints and works offline. If no UPI id is set yet, it points to
 * Settings instead of showing a broken code.
 */
export function UpiPay({ amountPaise, note }: { amountPaise: number; note?: string }) {
  const [upiId, setUpiId] = useState<string | null>(null);
  const [shop, setShop] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void (async () => {
      setUpiId(await getSetting("upi_id"));
      setShop((await getSetting("shop_name")) ?? "");
    })();
  }, []);

  const rupees = (amountPaise / 100).toFixed(2);
  const uri = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shop || "Vyora")}&am=${rupees}&cu=INR${note ? `&tn=${encodeURIComponent(note)}` : ""}`
    : "";

  useEffect(() => {
    if (!uri || !canvasRef.current) return;
    void (async () => {
      try {
        const mod = await import("qrcode");
        const QRCode = (mod as unknown as { default?: typeof mod }).default ?? mod;
        await QRCode.toCanvas(canvasRef.current, uri, { width: 132, margin: 1 });
      } catch {
        // qrcode not installed yet — the deep-link button still works.
      }
    })();
  }, [uri]);

  if (!upiId) {
    return (
      <div className="rounded-control border border-dashed border-border px-3 py-2 text-caption normal-case text-content-muted print:hidden">
        Accept UPI on every invoice —{" "}
        <Link href="/settings" className="font-medium text-primary hover:underline">add your UPI ID in Settings</Link>.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-canvas p-3">
      <canvas ref={canvasRef} width={132} height={132} className="rounded-control bg-white" />
      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold uppercase text-content-muted">Pay via UPI</span>
        <span className="text-body font-semibold">{formatPaise(amountPaise as Paise)}</span>
        <span className="font-mono text-caption text-content-muted">{upiId}</span>
        <a
          href={uri}
          className="mt-1 inline-block rounded-control bg-primary px-3 py-1.5 text-caption font-medium text-white print:hidden"
        >
          Pay now
        </a>
        <span className="hidden text-caption text-content-muted print:block">Scan to pay with any UPI app</span>
      </div>
    </div>
  );
}
