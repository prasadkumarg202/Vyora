import { FEATURES, PLANS, type FeatureKey } from "@vyora/core";
import { Badge, Button } from "@vyora/ui";
import Link from "next/link";

/**
 * What a shop sees instead of a module they have not paid for.
 *
 * One component, used by every gated page, for a reason the roadmap is
 * explicit about: gating scattered across screens drifts, and the drift always
 * favours the customer in one place and the vendor in another. Here the copy,
 * the plan name and the call to action are decided once.
 *
 * It states plainly what the feature is and what unlocks it. No countdown, no
 * dark pattern — a shopkeeper who cannot afford Pro this month should be able
 * to close this and go back to billing customers, which stays free.
 */
export function UpgradeGate({
  feature,
  title,
  summary,
}: {
  feature: FeatureKey;
  /** Falls back to the catalogue's own label. */
  title?: string;
  summary?: string;
}) {
  const def = FEATURES[feature];
  const plan = PLANS[def.minPlan];
  const comingSoon = def.status === "planned";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{title ?? def.label}</h1>
        <p className="text-body-lg text-content-muted">
          {summary ?? def.blurb}
        </p>
      </div>

      <div className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Badge tone={comingSoon ? "info" : "primary"}>
            {comingSoon ? "On the roadmap" : plan.name}
          </Badge>
          <span className="text-caption normal-case text-content-muted">
            {comingSoon
              ? "Not built yet — it is not part of any plan today."
              : `Included from ${plan.name} onward.`}
          </span>
        </div>

        <p className="text-body text-content-muted">
          {comingSoon
            ? "We would rather show you this honestly than sell it early. It is specced and on the build list; nothing you pay for today includes it."
            : `Your current plan does not include ${def.label.toLowerCase()}. Everything you already use — billing, GST, stock and reports — keeps working exactly as it does now.`}
        </p>

        {!comingSoon ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/subscriptions">
              <Button size="sm">See plans</Button>
            </Link>
            <Link
              href="/dashboard"
              className="text-body text-content-muted underline underline-offset-2 hover:text-primary"
            >
              Back to the dashboard
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
