import { PLANS, parseBillingCycle, parsePlanId, priceOf } from "@vyora/core";
import { NextResponse } from "next/server";

import { getBillingProvider, isLive } from "~/lib/billing/provider";
import { getTenantSession } from "~/lib/auth/session";

export const runtime = "nodejs";

/**
 * Starts a purchase: POST { planId, cycle } -> an order to hand to checkout.
 *
 * The price is read from the catalogue on the server. The request body carries
 * *which* plan, never *what it costs* — a client-supplied amount is how you end
 * up selling Business for ₹1.
 *
 * This route does not grant anything. It creates an order; the plan moves only
 * when the signed webhook arrives.
 */
export async function POST(request: Request) {
  const session = await getTenantSession();
  if (!session?.orgId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Only an owner can commit the workspace to a recurring payment.
  if (session.orgRole !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = body as { planId?: unknown; cycle?: unknown };
  const planId = parsePlanId(input.planId);
  const cycle = parseBillingCycle(input.cycle);

  if (!planId || planId === "free") {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  if (!cycle) {
    return NextResponse.json({ error: "invalid_cycle" }, { status: 400 });
  }

  try {
    const provider = getBillingProvider();
    const order = await provider.createOrder({
      orgId: session.orgId,
      planId,
      cycle,
      customerEmail: session.email,
    });

    return NextResponse.json({
      provider: order.provider,
      live: isLive(),
      orderId: order.orderId,
      keyId: order.keyId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      planId,
      planName: PLANS[planId].name,
      cycle,
      // Echoed so the UI can show the same figure the gateway will charge and
      // catch a catalogue/gateway mismatch before the shop does.
      catalogueAmountPaise: priceOf(planId, cycle),
    });
  } catch (error) {
    // Provider errors can carry account detail. Log it; return a code.
    console.error("[billing] checkout failed", error);
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
