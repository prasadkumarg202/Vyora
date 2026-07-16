"use client";

import { Button, Card, Input, Label } from "@vyora/ui";
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
    <Card className="p-0">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="business-name">Business name</Label>
          <Input
            id="business-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="Sri Sai Medicals"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="business-type">Business type</Label>
          <select
            id="business-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none transition-colors focus-visible:border-primary focus-visible:shadow-focus"
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
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending || name.trim().length < 2}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </Card>
  );
}
