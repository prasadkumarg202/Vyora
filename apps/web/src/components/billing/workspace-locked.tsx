"use client";

import {
  DAYS_UNTIL_LOCK,
  POST_TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
  type BillingCycle,
  type Entitlement,
} from "@vyora/core";
import { Button } from "@vyora/ui";
import { useState } from "react";

import { PlanCards } from "~/components/billing/plan-cards";
import { createBackup, downloadBackup } from "~/lib/db/backup";

/**
 * What a workspace sees from day 120: the app is closed, and two doors out.
 *
 * Door one is a plan. Door two is the shop's own data, in a file they keep,
 * downloadable without paying us anything. Both are on the same screen and
 * neither is hidden behind the other.
 *
 * That second door is not generosity. A shop's sales ledger is its statutory
 * record — in India it has to be producible for GST assessment for years — and
 * a vendor who withholds it is doing something worse than losing a customer.
 * The lock closes the software, not the books.
 */
export function WorkspaceLocked({
  entitlement,
  orgId,
  isOwner,
}: {
  entitlement: Entitlement;
  orgId: string;
  isOwner: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lapsed = entitlement.planId !== "free";

  async function exportEverything() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const backup = await createBackup(orgId);
      const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
      downloadBackup(backup);
      setMessage(
        `Saved ${total.toLocaleString("en-IN")} records to your downloads.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not build the file. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <span className="text-caption uppercase tracking-wide text-warning">
          Workspace closed
        </span>
        <h1 className="text-h1">
          {lapsed
            ? "Your subscription has lapsed."
            : "Your free period has ended."}
        </h1>
        <p className="max-w-2xl text-body-lg text-content-muted">
          {lapsed
            ? `The plan ended and the ${POST_TRIAL_GRACE_DAYS}-day wind-down is over. Choose a plan and everything comes straight back — nothing has been deleted.`
            : `You had ${TRIAL_DAYS} days of the whole product, then ${POST_TRIAL_GRACE_DAYS} more with billing, stock and reports — ${DAYS_UNTIL_LOCK} days in all. Choose a plan and everything comes straight back, exactly as you left it.`}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">Take your data with you, either way</h2>
          <p className="text-body text-content-muted">
            Your ledger is still on this device and it is yours. Download the
            whole thing as a file you keep — every invoice, party, item and
            payment — with or without a plan. Your GST records stay producible.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => void exportEverything()}
            disabled={busy}
          >
            {busy ? "Preparing…" : "Download all my data"}
          </Button>
          {message ? (
            <span className="text-body text-success">{message}</span>
          ) : null}
          {error ? (
            <span role="alert" className="text-body text-danger">
              {error}
            </span>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">Pick up where you left off</h2>
        {/*
          No currentPlan is passed: a locked workspace is not on one. With
          exactOptionalPropertyTypes, omitting the prop is how you say that —
          an explicit `undefined` is a type error, not a synonym for absent.
        */}
        {isOwner ? (
          <PlanCards cycle={cycle} onCycleChange={setCycle} canPurchase />
        ) : (
          <p className="text-body text-content-muted">
            Only the workspace owner can choose a plan. Ask them to sign in and
            pick one, and this device will open again as soon as they do.
          </p>
        )}
      </section>
    </main>
  );
}
