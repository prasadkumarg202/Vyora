import { parseBillingCycle, parsePlanId, priceOf } from "@vyora/core";
import { NextResponse } from "next/server";

import { getTenantSession } from "~/lib/auth/session";
import { getBillingProvider, isLive } from "~/lib/billing/provider";
import { hmacSha256Hex } from "~/lib/billing/signature";

export const runtime = "nodejs";

/**
 * Mock-mode only: builds a correctly signed webhook and posts it at our own
 * webhook route.
 *
 * The point is that the *only* way to activate a plan, even in development, is
 * a signed webhook. There is no shortcut that writes the org row directly —
 * because a shortcut is exactly the thing that survives into production by
 * accident.
 *
 * Hard-refuses the moment real Razorpay credentials exist.
 */
export async function POST(request: Request) {
  if (isLive()) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const session = await getTenantSession();
  if (!session?.orgId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (session.orgRole !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    planId?: unknown;
    cycle?: unknown;
    orderId?: unknown;
    outcome?: unknown;
  };

  const planId = parsePlanId(body.planId);
  const cycle = parseBillingCycle(body.cycle);
  if (!planId || planId === "free" || !cycle) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const failed = body.outcome === "failed";
  const orderId =
    typeof body.orderId === "string"
      ? body.orderId
      : `order_mock_${session.orgId}`;

  const event = {
    // Deterministic per (org, plan, cycle, outcome): pressing the button twice
    // is a duplicate delivery, which is precisely what we want to be able to
    // test.
    id: `evt_mock_${orderId}_${failed ? "failed" : "captured"}`,
    event: failed ? "payment.failed" : "payment.captured",
    payload: {
      payment: {
        entity: {
          id: `pay_mock_${orderId.slice(-12)}`,
          amount: priceOf(planId, cycle),
          currency: "INR",
          order_id: orderId,
          notes: {
            org_id: session.orgId,
            plan_id: planId,
            cycle,
          },
        },
      },
    },
  };

  const raw = JSON.stringify(event);
  const signature = await hmacSha256Hex(
    getBillingProvider().webhookSecret(),
    raw,
  );

  const response = await fetch(new URL("/api/billing/webhook", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
      "x-razorpay-event-id": event.id,
    },
    body: raw,
  });

  const result = (await response.json().catch(() => ({}))) as unknown;
  return NextResponse.json(
    { simulated: true, outcome: failed ? "failed" : "captured", result },
    { status: response.ok ? 200 : 502 },
  );
}
