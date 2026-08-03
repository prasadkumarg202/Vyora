"use client";

import {
  COMPARISON,
  DAYS_UNTIL_LOCK,
  FEATURE_GROUPS,
  PLANS,
  PLAN_ORDER,
  POST_TRIAL_GRACE_DAYS,
  featuresInGroup,
  isAtLeast,
  type BillingCycle,
  type FeatureDef,
  type PlanId,
} from "@vyora/core";
import { Badge } from "@vyora/ui";
import { useState } from "react";

import { PlanCards } from "~/components/billing/plan-cards";

/**
 * The public pricing page's interactive half: the cards, the full
 * feature-by-plan matrix, and the honest comparison against the incumbents.
 *
 * All three read the same catalogue the app enforces at runtime. There is no
 * separate "marketing copy" list of what a plan includes, because that is the
 * list that goes stale and turns into a promise the product does not keep.
 */
export function PricingTables() {
  const [cycle, setCycle] = useState<BillingCycle>("yearly");

  return (
    <div className="flex flex-col gap-14">
      <PlanCards cycle={cycle} onCycleChange={setCycle} />

      <section id="compare" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2">Everything, plan by plan</h2>
          <p className="text-body text-content-muted">
            The <strong>{PLANS.free.name}</strong> column is not a plan you can
            buy — it is what keeps working for the {POST_TRIAL_GRACE_DAYS} days
            between your trial ending and the workspace closing on day{" "}
            {DAYS_UNTIL_LOCK}. Features marked <em>on the roadmap</em> are not
            built yet; they are listed so you can see where the product is
            going, and you are not paying for them today.
          </p>
        </div>

        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <table className="w-full min-w-[46rem] text-body">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-caption uppercase text-content-muted">
                  Feature
                </th>
                {PLAN_ORDER.map((id) => (
                  <th key={id} className="px-4 py-3 text-center">
                    <span className="text-body font-semibold">
                      {PLANS[id].name.replace("Vyora ", "")}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map((group) => (
                <FeatureGroupRows
                  key={group}
                  group={group}
                  features={featuresInGroup(group)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="versus" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2">How this compares</h2>
          <p className="text-body text-content-muted">
            The three products Indian shops usually weigh us against, on the
            points where packaging actually differs.
          </p>
        </div>

        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <table className="w-full min-w-[52rem] text-body">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-caption uppercase text-content-muted">
                  &nbsp;
                </th>
                <th className="px-4 py-3 text-body font-semibold text-primary">
                  Vyora
                </th>
                <th className="px-4 py-3 text-body font-semibold">Vyapar</th>
                <th className="px-4 py-3 text-body font-semibold">
                  myBillBook
                </th>
                <th className="px-4 py-3 text-body font-semibold">
                  Zoho Books
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr
                  key={row.claim}
                  className="border-b border-border last:border-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-body font-medium"
                  >
                    {row.claim}
                  </th>
                  <td className="px-4 py-3 text-content">{row.vyora}</td>
                  <td className="px-4 py-3 text-content-muted">{row.vyapar}</td>
                  <td className="px-4 py-3 text-content-muted">
                    {row.mybillbook}
                  </td>
                  <td className="px-4 py-3 text-content-muted">{row.zoho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-caption normal-case text-content-muted">
          Competitor packaging as published on their own websites in August
          2026, and it changes — please check theirs before deciding. We have
          compared how plans are packaged, not how good the products are; all
          three are capable tools.
        </p>
      </section>
    </div>
  );
}

function FeatureGroupRows({
  group,
  features,
}: {
  group: string;
  features: readonly FeatureDef[];
}) {
  return (
    <>
      <tr className="border-b border-border bg-canvas">
        <th
          colSpan={PLAN_ORDER.length + 1}
          scope="colgroup"
          className="px-4 py-2 text-left text-caption uppercase tracking-wide text-content-muted"
        >
          {group}
        </th>
      </tr>
      {features.map((feature) => (
        <tr key={feature.key} className="border-b border-border last:border-0">
          <th scope="row" className="px-4 py-3 text-left font-normal">
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-body font-medium">
                {feature.label}
                {feature.status === "planned" ? (
                  <Badge tone="info">On the roadmap</Badge>
                ) : null}
              </span>
              <span className="text-caption normal-case text-content-muted">
                {feature.blurb}
              </span>
            </span>
          </th>
          {PLAN_ORDER.map((id) => (
            <td key={id} className="px-4 py-3 text-center">
              <Included included={isAtLeast(id, feature.minPlan)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Included({ included }: { included: boolean }) {
  return (
    <span
      // The glyph alone would read as an unlabelled "x" to a screen reader,
      // and as nothing at all to anyone who cannot distinguish the colours.
      aria-label={included ? "Included" : "Not included"}
      className={included ? "text-success" : "text-content-muted"}
    >
      <span aria-hidden>{included ? "✓" : "—"}</span>
    </span>
  );
}
