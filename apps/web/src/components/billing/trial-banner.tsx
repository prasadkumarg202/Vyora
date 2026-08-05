"use client";

import {
  POST_TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
  type Entitlement,
} from "@vyora/core";
import { Button } from "@vyora/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getSetting, setSetting } from "~/lib/db/repository";

/**
 * The countdown, said plainly.
 *
 * Silent for the first two months of the trial: a banner from day one is
 * wallpaper by day ten. It appears in the last thirty days of the trial, and
 * then again — undismissable — through the one-month wind-down, when the
 * workspace is genuinely counting down to closing.
 *
 * The wind-down message never softens the deadline. A shop that finds out on
 * day 120 that billing has stopped will not blame itself for missing a hint,
 * and it would be right not to.
 *
 * Dismissal is stored in the local key–value table rather than in a cookie, so
 * it survives offline and does not travel to another device where the owner
 * may not have seen it at all.
 */

const DISMISS_KEY = "billing.trialBannerDismissedAt";

export function TrialBanner({ entitlement }: { entitlement: Entitlement }) {
  const [dismissed, setDismissed] = useState(true);

  const trialDaysLeft = entitlement.trialDaysLeft ?? 0;
  const daysToLock = entitlement.daysUntilLock ?? 0;
  const windingDown = entitlement.isWindingDown;

  // The lock screen replaces the entire app, so a banner above it would only
  // repeat itself.
  const relevant =
    !entitlement.isLocked && (entitlement.showTrialWarning || windingDown);

  useEffect(() => {
    if (!relevant) return;
    let live = true;
    void (async () => {
      const stored = await getSetting(DISMISS_KEY);
      // Dismissal lasts a day, then the banner returns — the deadline is real
      // and moves closer. During the wind-down it cannot be dismissed at all.
      const fresh =
        stored !== null && Date.now() - Number(stored) < 24 * 60 * 60 * 1000;
      if (live) setDismissed(windingDown ? false : fresh);
    })();
    return () => {
      live = false;
    };
  }, [relevant, windingDown]);

  if (!relevant || dismissed) return null;

  return (
    <div
      role="status"
      data-testid="trial-banner"
      // A stable hook for the e2e suite, and a stable thing for support to ask
      // about: "what does the banner say" has one answer per phase.
      data-phase={windingDown ? "wind_down" : "trial"}
      className={
        "flex flex-wrap items-center gap-3 border-b px-4 py-2 text-body " +
        (windingDown
          ? "border-warning-border bg-warning-tonal text-warning"
          : "border-info-border bg-info-tonal text-info")
      }
    >
      <span className="font-medium">
        {windingDown
          ? daysToLock <= 1
            ? "This workspace closes tomorrow."
            : `This workspace closes in ${daysToLock} days.`
          : trialDaysLeft <= 1
            ? "Your free trial ends today."
            : `${trialDaysLeft} days left in your free trial.`}
      </span>
      <span className="text-content-muted">
        {windingDown
          ? `You are on the basics — billing, stock and reports — for ${POST_TRIAL_GRACE_DAYS} days after the trial. Pick a plan before then and nothing stops; you can download all your data at any time either way.`
          : `You have had the full product for ${TRIAL_DAYS} days. After that you keep billing, stock and reports for ${POST_TRIAL_GRACE_DAYS} more days, then the workspace closes until you choose a plan.`}
      </span>

      <span className="ml-auto flex items-center gap-2">
        <Link href="/subscriptions">
          <Button size="sm" variant="outline">
            {windingDown ? "Choose a plan" : "See plans"}
          </Button>
        </Link>
        {!windingDown ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDismissed(true);
              void setSetting(DISMISS_KEY, String(Date.now()));
            }}
          >
            Later
          </Button>
        ) : null}
      </span>
    </div>
  );
}
