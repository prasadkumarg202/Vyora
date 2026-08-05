import "server-only";

import { PLANS, priceOf, type BillingCycle, type PlanId } from "@vyora/core";

import { serverEnv } from "~/env";
import { hmacSha256Hex } from "~/lib/billing/signature";

/**
 * The payment provider, behind one interface.
 *
 * Razorpay needs a registered business and completed KYC; that is weeks of
 * paperwork and the roadmap says not to let it block the build. So the whole
 * money path — order creation, checkout handshake, signed webhook, plan
 * activation — is implemented against this interface, with a mock that walks
 * the identical steps and signs with the identical algorithm.
 *
 * Switching to the real thing is a matter of setting three environment
 * variables. Nothing above this file knows which one is running, which is the
 * only way to be sure the mock is actually exercising the real code path.
 */

export type ProviderName = "razorpay" | "mock";

export interface CreateOrderInput {
  readonly orgId: string;
  readonly planId: Exclude<PlanId, "free">;
  readonly cycle: BillingCycle;
  /** Shown on the Razorpay checkout sheet. */
  readonly customerEmail: string | null;
}

export interface ProviderOrder {
  readonly provider: ProviderName;
  readonly orderId: string;
  /** GST-inclusive paise — the amount Razorpay will actually charge. */
  readonly amountPaise: number;
  readonly currency: "INR";
  /** Publishable key for the checkout widget. Null in mock mode. */
  readonly keyId: string | null;
  /** Everything the client needs to identify the purchase on return. */
  readonly notes: Readonly<Record<string, string>>;
}

export interface BillingProvider {
  readonly name: ProviderName;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  /** The secret webhook deliveries are signed with. */
  webhookSecret(): string;
}

/** True when real Razorpay credentials are present. */
export function isLive(): boolean {
  return Boolean(serverEnv.RAZORPAY_KEY_ID && serverEnv.RAZORPAY_KEY_SECRET);
}

/**
 * Deterministic, non-secret placeholder used to sign mock webhooks.
 *
 * Hard-coded on purpose: it is only ever reachable when no real credentials
 * exist, and a mock secret pulled from env would be one misconfiguration away
 * from being the *production* secret's fallback.
 */
export const MOCK_WEBHOOK_SECRET = "vyora_mock_webhook_secret";

class MockProvider implements BillingProvider {
  readonly name = "mock" as const;

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const amountPaise = priceOf(input.planId, input.cycle);
    // Derived from the inputs rather than random, so the same purchase
    // attempted twice collides on the unique index instead of creating two
    // subscriptions — the behaviour a real idempotency key gives us.
    const digest = await hmacSha256Hex(
      MOCK_WEBHOOK_SECRET,
      `${input.orgId}:${input.planId}:${input.cycle}`,
    );
    return {
      provider: "mock",
      orderId: `order_mock_${digest.slice(0, 20)}`,
      amountPaise,
      currency: "INR",
      keyId: null,
      notes: {
        org_id: input.orgId,
        plan_id: input.planId,
        cycle: input.cycle,
      },
    };
  }

  webhookSecret(): string {
    return MOCK_WEBHOOK_SECRET;
  }
}

class RazorpayProvider implements BillingProvider {
  readonly name = "razorpay" as const;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly hookSecret: string,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const amountPaise = priceOf(input.planId, input.cycle);

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        // Razorpay rejects a duplicate receipt, which makes it our idempotency
        // key: a double-clicked upgrade returns the existing order.
        receipt: `vyora_${input.orgId}_${input.planId}_${input.cycle}`,
        notes: {
          org_id: input.orgId,
          plan_id: input.planId,
          cycle: input.cycle,
          plan_name: PLANS[input.planId].name,
        },
      }),
    });

    if (!response.ok) {
      // The provider's error body can carry account identifiers; log the
      // status and keep the body out of anything the browser sees.
      throw new Error(`Razorpay order failed: ${response.status}`);
    }

    const order = (await response.json()) as {
      id?: unknown;
      amount?: unknown;
    };

    if (typeof order.id !== "string") {
      throw new Error("Razorpay returned an order without an id.");
    }

    return {
      provider: "razorpay",
      orderId: order.id,
      amountPaise:
        typeof order.amount === "number" ? order.amount : amountPaise,
      currency: "INR",
      keyId: this.keyId,
      notes: {
        org_id: input.orgId,
        plan_id: input.planId,
        cycle: input.cycle,
      },
    };
  }

  webhookSecret(): string {
    return this.hookSecret;
  }
}

export function getBillingProvider(): BillingProvider {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } =
    serverEnv;

  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    if (!RAZORPAY_WEBHOOK_SECRET) {
      // Live keys with no webhook secret is the dangerous half-configuration:
      // we would take money and never learn that we had. Fail loudly.
      throw new Error(
        "RAZORPAY_WEBHOOK_SECRET is required whenever Razorpay keys are set.",
      );
    }
    return new RazorpayProvider(
      RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET,
    );
  }

  return new MockProvider();
}
