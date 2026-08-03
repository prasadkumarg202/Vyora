"use client";

import type { BillingCycle, PlanId } from "@vyora/core";
import { Button } from "@vyora/ui";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Starts a purchase and waits for the plan to actually change.
 *
 * The important part is what this component does NOT do: it never tells the
 * server that a payment succeeded. It asks for an order, hands that order to
 * the gateway, and then reloads — the plan only moves when the signed webhook
 * has been processed. If the browser is closed mid-payment, the webhook still
 * lands and the shop still gets what it paid for.
 *
 * With no Razorpay credentials configured the same path runs against the mock
 * provider, which signs and delivers a webhook to our own endpoint. The code
 * under test is therefore the code that will run live.
 */

interface CheckoutOrder {
  provider: "razorpay" | "mock";
  orderId: string;
  keyId: string | null;
  amountPaise: number;
  planName: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: Record<string, string>) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}

type RazorpayConstructor = new (options: RazorpayOptions) => {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

export function CheckoutButton({
  planId,
  cycle,
  label,
  disabled,
  variant = "primary",
}: {
  planId: Exclude<PlanId, "free">;
  cycle: BillingCycle;
  label: string;
  disabled?: boolean;
  variant?: "primary" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(messageFor(body.error));
      }

      const order = (await response.json()) as CheckoutOrder;

      if (order.provider === "mock" || !order.keyId) {
        // Sandbox: the same webhook the gateway would send, signed and
        // delivered server-side.
        const simulated = await fetch("/api/billing/simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planId, cycle, orderId: order.orderId }),
        });
        if (!simulated.ok)
          throw new Error("Test payment could not be recorded.");
        router.refresh();
        return;
      }

      await loadRazorpay();
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Could not reach the payment gateway.");

      new Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: "INR",
        name: "Vyora",
        description: order.planName,
        order_id: order.orderId,
        handler: () => {
          // Deliberately no "success" call to our API. Refresh and let the
          // webhook be the one that says so.
          router.refresh();
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }, [planId, cycle, router]);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        size="sm"
        disabled={disabled || busy}
        onClick={() => void start()}
      >
        {busy ? "Please wait…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-caption normal-case text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function messageFor(code: string | undefined): string {
  switch (code) {
    case "owner_only":
      return "Only the workspace owner can change the plan.";
    case "not_authenticated":
      return "Please sign in again.";
    case "provider_error":
      return "The payment gateway did not respond. Please try again.";
    default:
      return "Could not start the payment.";
  }
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  // Cached, so a double click does not append two script tags.
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    // The app sets Cross-Origin-Embedder-Policy: require-corp for sqlite-wasm,
    // so a third-party script must be fetched in CORS mode or it is blocked.
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the payment gateway."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
