"use client";

import {
  can,
  isPlanned,
  requiredPlanFor,
  type Entitlement,
  type FeatureKey,
  type PlanId,
} from "@vyora/core";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The workspace's entitlement, resolved on the server, made available to
 * client components.
 *
 * This exists so the *interface* can react — a locked module greys out, an
 * upgrade prompt names the right plan. It is not a security boundary. Anything
 * that actually matters is re-checked on the server, because this value
 * reaches the browser and the browser can lie about it.
 */

const EntitlementContext = createContext<Entitlement | null>(null);

export function EntitlementProvider({
  entitlement,
  children,
}: {
  entitlement: Entitlement;
  children: ReactNode;
}) {
  // The object arrives fresh from the server on every render of the layout;
  // memoising on its identity keeps consumers from re-rendering when an
  // unrelated part of the tree updates.
  const value = useMemo(() => entitlement, [entitlement]);
  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): Entitlement {
  const value = useContext(EntitlementContext);
  if (!value) {
    throw new Error(
      "useEntitlement() outside <EntitlementProvider>. The app shell provides it; " +
        "a component rendered outside (app)/layout.tsx cannot use it.",
    );
  }
  return value;
}

export interface FeatureVerdict {
  readonly allowed: boolean;
  /** True when the feature is on the roadmap rather than behind a paywall. */
  readonly comingSoon: boolean;
  readonly requiredPlan: PlanId;
}

/** The single question a screen asks about a feature. */
export function useFeature(feature: FeatureKey): FeatureVerdict {
  const entitlement = useEntitlement();
  return useMemo(
    () => ({
      allowed: can(entitlement, feature),
      comingSoon: isPlanned(feature),
      requiredPlan: requiredPlanFor(feature),
    }),
    [entitlement, feature],
  );
}
