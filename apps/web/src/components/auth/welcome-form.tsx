"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createWorkspace } from "~/lib/auth/actions";

interface BusinessType {
  key: string;
  label: string;
}

/**
 * Minimal workspace bootstrap: enough to get a signed-in user into the app.
 *
 * The designed onboarding — pick a business type, watch the workspace generate
 * itself from metadata, preview fields/GST/reports before confirming — is
 * Phase 5, since it needs the metadata engine to mean anything. This collects
 * the same two facts without the generated preview.
 */
export function WelcomeForm({
  businessTypes,
}: {
  businessTypes: BusinessType[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createWorkspace(name, type || undefined);
      if (result.ok) {
        router.refresh();
        router.push("/dashboard");
      } else {
        setError(result.error ?? "Could not create the workspace.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-caption uppercase tracking-wide text-content-muted">
          Business name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          placeholder="Sri Sai Medicals"
          className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg outline-none focus:border-primary focus:shadow-focus"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption uppercase tracking-wide text-content-muted">
          Business type
        </span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg outline-none focus:border-primary focus:shadow-focus"
        >
          <option value="">Choose later</option>
          {businessTypes.map((bt) => (
            <option key={bt.key} value={bt.key}>
              {bt.label}
            </option>
          ))}
        </select>
        <span className="text-caption normal-case text-content-muted">
          Drives your fields, GST rules and reports from Phase 5 onward.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || name.trim().length < 2}
        className="min-h-touch rounded-control bg-primary px-4 text-body font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
