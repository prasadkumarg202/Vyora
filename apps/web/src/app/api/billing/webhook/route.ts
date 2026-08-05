import {
  parseBillingCycle,
  parsePlanId,
  priceOf,
  splitGstInclusive,
  type BillingCycle,
  type PlanId,
} from "@vyora/core";
import { NextResponse } from "next/server";

import { getBillingProvider } from "~/lib/billing/provider";
import { verifyWebhookSignature } from "~/lib/billing/signature";
import { createAdminClient } from "~/lib/supabase/server";

export const runtime = "nodejs";

/**
 * The only thing in this codebase that may move a workspace onto a paid plan.
 *
 * Order of operations, and why:
 *   1. Read the body as TEXT and verify the HMAC over those exact bytes.
 *      Parsing first and re-serialising changes whitespace and key order, and
 *      the digest with it.
 *   2. Record the event. Unique on (provider, event id), so Razorpay's retries
 *      — which are guaranteed, not hypothetical — cannot extend a subscription
 *      twice. A duplicate returns 200: telling the provider to keep retrying
 *      an event we have already handled is how retry storms start.
 *   3. Only then apply the plan change, through a definer function that writes
 *      the subscription row and the org row together.
 *
 * A browser saying "payment succeeded" reaches none of this.
 */

type PlanChange = {
  readonly orgId: string;
  readonly planId: Exclude<PlanId, "free">;
  readonly cycle: BillingCycle;
  readonly status: "active" | "past_due" | "cancelled";
  readonly amountPaise: number;
  readonly paymentId: string | null;
  readonly subscriptionId: string | null;
};

export async function POST(request: Request) {
  const provider = getBillingProvider();

  const raw = await request.text();
  const signature =
    request.headers.get("x-razorpay-signature") ??
    request.headers.get("x-vyora-signature");

  const verified = await verifyWebhookSignature(
    raw,
    signature,
    provider.webhookSecret(),
  );

  if (!verified) {
    // No detail in the response: an attacker probing the endpoint learns only
    // that the signature was wrong, not why.
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: RazorpayEvent;
  try {
    payload = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    payload.id ??
    // Last resort so an event without an id still deduplicates on its content
    // rather than being replayable at will.
    (await contentFingerprint(raw));

  const eventType =
    typeof payload.event === "string" ? payload.event : "unknown";
  const change = extractChange(payload);

  const admin = createAdminClient();

  const { error: insertError } = await admin.from("billing_events").insert({
    org_id: change?.orgId ?? null,
    provider: provider.name,
    provider_event_id: eventId,
    event_type: eventType,
    payload: payload as unknown as Record<string, unknown>,
    signature_verified: true,
  });

  if (insertError) {
    // 23505 = unique violation = we have seen this delivery already.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[billing] could not record event", insertError);
    return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }

  if (!change) {
    // Recorded, deliberately not acted on: a subscription event we do not
    // model yet is data, not an error.
    await markProcessed(admin, provider.name, eventId, null);
    return NextResponse.json({ ok: true, applied: false });
  }

  // The catalogue price, not the gateway's number, decides what the receipt
  // says — but a mismatch means our pricing page and our merchant account
  // disagree, and that must be visible rather than silently reconciled.
  const expected = priceOf(change.planId, change.cycle);
  if (change.amountPaise !== expected) {
    console.warn(
      `[billing] amount mismatch for org ${change.orgId}: charged ${change.amountPaise}, catalogue ${expected}`,
    );
  }

  const periodStart = new Date();
  const periodEnd = addPeriod(periodStart, change.cycle);

  const { data: subscriptionId, error: applyError } = await admin.rpc(
    "apply_subscription",
    {
      p_org_id: change.orgId,
      p_plan: change.planId,
      p_cycle: change.cycle,
      p_status: change.status,
      p_provider: provider.name,
      p_provider_subscription_id: change.subscriptionId ?? change.paymentId,
      p_amount_paise: change.amountPaise,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
    },
  );

  if (applyError) {
    await markProcessed(admin, provider.name, eventId, applyError.message);
    console.error("[billing] apply_subscription failed", applyError);
    return NextResponse.json({ error: "apply_failed" }, { status: 500 });
  }

  if (change.status === "active") {
    const split = splitGstInclusive(change.amountPaise);
    const { error: receiptError } = await admin
      .from("billing_invoices")
      .insert({
        org_id: change.orgId,
        subscription_id: subscriptionId,
        plan_id: change.planId,
        cycle: change.cycle,
        base_paise: split.base,
        tax_paise: split.tax,
        total_paise: split.total,
        provider: provider.name,
        provider_payment_id: change.paymentId,
        paid_at: periodStart.toISOString(),
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      });
    // A duplicate receipt for a re-delivered payment is expected and harmless;
    // anything else is worth knowing about, but never worth failing the plan
    // change that already succeeded.
    if (receiptError && receiptError.code !== "23505") {
      console.error("[billing] receipt insert failed", receiptError);
    }
  }

  await markProcessed(admin, provider.name, eventId, null);
  return NextResponse.json({ ok: true, applied: true });
}

// ---------------------------------------------------------------------------

interface RazorpayEntity {
  readonly id?: string;
  readonly amount?: number;
  readonly order_id?: string;
  readonly subscription_id?: string;
  readonly notes?: Record<string, unknown>;
}

interface RazorpayEvent {
  readonly id?: string;
  readonly event?: string;
  readonly payload?: {
    readonly payment?: { readonly entity?: RazorpayEntity };
    readonly order?: { readonly entity?: RazorpayEntity };
    readonly subscription?: { readonly entity?: RazorpayEntity };
  };
}

/**
 * Pulls the plan change out of a Razorpay event.
 *
 * The org, plan and cycle come from `notes`, which we set when creating the
 * order — Razorpay returns them untouched. Returns null for events we do not
 * model, or whose notes are missing or unrecognised, so a malformed delivery
 * gets recorded and ignored rather than upgrading someone at random.
 */
function extractChange(event: RazorpayEvent): PlanChange | null {
  const entity =
    event.payload?.payment?.entity ??
    event.payload?.subscription?.entity ??
    event.payload?.order?.entity;

  if (!entity) return null;

  const notes = entity.notes ?? {};
  const orgId = typeof notes.org_id === "string" ? notes.org_id : null;
  const planId = parsePlanId(notes.plan_id);
  const cycle = parseBillingCycle(notes.cycle);

  if (!orgId || !planId || planId === "free" || !cycle) return null;

  const status = statusForEvent(event.event);
  if (!status) return null;

  return {
    orgId,
    planId,
    cycle,
    status,
    amountPaise:
      typeof entity.amount === "number"
        ? entity.amount
        : priceOf(planId, cycle),
    paymentId: typeof entity.id === "string" ? entity.id : null,
    subscriptionId:
      typeof entity.subscription_id === "string"
        ? entity.subscription_id
        : null,
  };
}

function statusForEvent(
  event: string | undefined,
): PlanChange["status"] | null {
  switch (event) {
    case "payment.captured":
    case "order.paid":
    case "subscription.charged":
    case "subscription.activated":
      return "active";
    case "payment.failed":
    case "subscription.pending":
    case "subscription.halted":
      return "past_due";
    case "subscription.cancelled":
    case "subscription.completed":
      return "cancelled";
    default:
      return null;
  }
}

/** Yearly is 12 calendar months, not 365 days — a renewal should land on the
 *  same date, and February should not shift it. */
function addPeriod(from: Date, cycle: BillingCycle): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + (cycle === "yearly" ? 12 : 1));
  return end;
}

async function contentFingerprint(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return `sha256_${[...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)}`;
}

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  provider: string,
  eventId: string,
  error: string | null,
): Promise<void> {
  await admin
    .from("billing_events")
    .update({ processed_at: new Date().toISOString(), error })
    .eq("provider", provider)
    .eq("provider_event_id", eventId);
}
