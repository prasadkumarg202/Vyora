"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { sendOtp, verifyOtp } from "~/lib/auth/actions";

type Step = "identify" | "verify";

/**
 * Where the pending login lives across a reload.
 *
 * sessionStorage, not the URL: the address is personal data and query strings
 * end up in server logs, history and referrers. sessionStorage is scoped to the
 * tab and dies with it.
 */
const PENDING_KEY = "vyora.login.pending";

interface Pending {
  step: Step;
  email: string;
}

/**
 * Two-step OTP login, per design/Vyora Authentication.dc.html:
 *   1. enter identifier -> 2. verify the code -> tokens issued
 *
 * The spec says "6-digit", which is the SMS default. Email OTPs are 8 digits,
 * and both are per-project settings, so nothing here assumes a length.
 *
 * The key-unwrap step (4) and offline-ready step (5) from that flow belong to
 * the crypto and sync packages and arrive in Phase 6.
 *
 * Styling here is structural. Phase 4 replaces it with the design system.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A code has already been sent and the user reloads, or switches back to the
  // tab after fetching it. Losing their place would make them request a second
  // code and burn a rate limit for nothing.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Pending;
      if (saved.step === "verify" && saved.email) {
        setEmail(saved.email);
        setStep("verify");
      }
    } catch {
      // Corrupt or unavailable storage: just start at step 1.
    }
  }, []);

  function remember(next: Pending | null) {
    try {
      if (next) sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // Private mode can throw on write; the flow still works in-memory.
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendOtp(email);
      if (result.ok) {
        setStep("verify");
        remember({ step: "verify", email: email.trim().toLowerCase() });
      } else {
        setError(result.error ?? "Could not send the code.");
      }
    });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyOtp(email, code);
      if (result.ok) {
        remember(null);
        // refresh() so middleware re-runs with the new session cookies before
        // the destination renders; push() alone can race the cookie write.
        router.refresh();
        router.push(next as never);
      } else {
        setError(result.error ?? "Could not verify the code.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card">
      {step === "identify" ? (
        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption uppercase tracking-wide text-content-muted">
              Email address
            </span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              placeholder="you@business.in"
              className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg outline-none focus:border-primary focus:shadow-focus"
            />
          </label>

          {error ? <ErrorNote message={error} /> : null}

          <button
            type="submit"
            disabled={pending}
            className="min-h-touch rounded-control bg-primary px-4 text-body font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send code"}
          </button>

          <p className="text-caption normal-case text-content-muted">
            Production signs in by phone. Email is used in development because
            SMS needs a paid provider — the code flow is identical.
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-body font-medium">Enter the code</span>
            <span className="text-body text-content-muted">
              Sent to {email}. It expires in 5 minutes.
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-caption uppercase tracking-wide text-content-muted">
              Verification code
            </span>
            <input
              // inputMode numeric so phones show a number pad.
              inputMode="numeric"
              // Not fixed at 6: the spec's "6-digit code" describes SMS, while
              // email OTPs are 8 digits by default. Both are project settings,
              // so accept the range and let the auth server decide.
              pattern="\d{4,10}"
              maxLength={10}
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              autoComplete="one-time-code"
              placeholder="Code from your email"
              className="min-h-touch rounded-input border border-border bg-surface px-3 font-mono text-h3 tracking-[0.3em] outline-none focus:border-primary focus:shadow-focus"
            />
          </label>

          {error ? <ErrorNote message={error} /> : null}

          <button
            type="submit"
            disabled={pending || code.length < 4}
            className="min-h-touch rounded-control bg-primary px-4 text-body font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "Verifying…" : "Verify & sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("identify");
              setCode("");
              setError(null);
              remember(null);
            }}
            className="min-h-touch text-body text-content-muted underline-offset-4 hover:underline"
          >
            Use a different address
          </button>
        </form>
      )}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-body text-danger"
    >
      {message}
    </p>
  );
}
