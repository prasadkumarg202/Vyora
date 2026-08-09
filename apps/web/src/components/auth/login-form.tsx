"use client";

import { Button, Card, Input, Label } from "@vyora/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { sendOtp, verifyOtp } from "~/lib/auth/actions";
import { safeNext } from "~/lib/auth/safe-next";

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
  /** The mobile number or email address the code went to. */
  email: string;
  channel?: "sms" | "email";
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
  // router.push() follows an absolute URL straight off-site, so the same
  // open-redirect guard the callback route uses applies here too.
  const next = safeNext(params.get("next"));
  const urlError = params.get("error");

  const [step, setStep] = useState<Step>("identify");
  // SMS is what a shopkeeper expects; email stays reachable because SMS is the
  // more fragile channel — a carrier or DLT rejection must not lock an owner
  // out of their own books.
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /**
   * Seconds until another code may be requested. A resend link with no cooldown
   * invites impatient double-taps, and every one of those is a paid SMS and a
   * step closer to Supabase's rate limit — at which point the shopkeeper is
   * locked out for minutes with no explanation.
   */
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (urlError) {
      setError(urlError);
    }
  }, [urlError]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

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
        if (saved.channel === "email" || saved.channel === "sms") {
          setChannel(saved.channel);
        }
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

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    // What was typed decides the channel, not what the toggle happens to say.
    // Someone who pastes their email address into the mobile field means "mail
    // me the code" — refusing them because a switch is in the wrong position is
    // the app being pedantic about its own UI. An "@" cannot appear in an
    // Indian mobile number, so the test is unambiguous in the other direction
    // too, and the toggle still governs an empty or half-typed field.
    const typed = email.trim();
    const sendVia: "sms" | "email" = typed.includes("@") ? "email" : channel;
    if (sendVia !== channel) setChannel(sendVia);

    startTransition(async () => {
      try {
        const result = await sendOtp(typed, sendVia);
        if (result.ok) {
          setStep("verify");
          setCooldown(30);
          remember({
            step: "verify",
            email: sendVia === "sms" ? typed : typed.toLowerCase(),
            channel: sendVia,
          });
        } else {
          setError(result.error ?? "Could not send the code.");
        }
      } catch {
        // The action itself failed to reach the server — offline, or a dropped
        // request. Its internals are not useful to the user; the action returns
        // anything actionable via result.error above.
        setError("Could not reach the server. Check your connection.");
      }
    });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await verifyOtp(email, code, channel);
        if (result.ok) {
          remember(null);
          // refresh() so middleware re-runs with the new session cookies before
          // the destination renders; push() alone can race the cookie write.
          router.refresh();
          router.push(next as never);
        } else {
          setError(result.error ?? "Could not verify the code.");
        }
      } catch {
        setError("Could not reach the server. Check your connection.");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      {step === "identify" ? (
        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identifier">
              {channel === "sms" ? "Mobile number" : "Email address"}
            </Label>
            {channel === "sms" ? (
              <div className="flex items-stretch gap-0">
                {/* Fixed +91 so ten digits is all anyone types. */}
                <span className="flex items-center rounded-l-input border border-r-0 border-border bg-canvas px-3 font-mono text-body text-content-muted">
                  +91
                </span>
                <Input
                  id="identifier"
                  type="tel"
                  name="phone"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  className="rounded-l-none font-mono"
                />
              </div>
            ) : (
              <Input
                id="identifier"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="you@business.in"
              />
            )}
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setChannel(channel === "sms" ? "email" : "sms");
              setEmail("");
              setError(null);
            }}
            className="text-caption font-medium normal-case text-primary hover:underline"
          >
            {channel === "sms"
              ? "No SMS? Use your email instead"
              : "Use your mobile number instead"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-body font-medium">Enter the code</span>
            <span className="text-body text-content-muted">
              Sent to {channel === "sms" ? `+91 ${email}` : email}. It expires in 5
              minutes.
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={pending || cooldown > 0}
              className="self-start text-caption font-medium normal-case text-primary hover:underline disabled:cursor-not-allowed disabled:text-content-muted disabled:no-underline"
            >
              {cooldown > 0 ? `Send it again in ${cooldown}s` : "Send it again"}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
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
              placeholder={channel === "sms" ? "Code from the SMS" : "Code from your email"}
              className="text-center font-mono text-h3 tracking-[0.3em]"
            />
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <Button type="submit" disabled={pending || code.length < 4}>
            {pending ? "Verifying…" : "Verify & sign in"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStep("identify");
              setCode("");
              setError(null);
              remember(null);
            }}
          >
            {channel === "sms" ? "Use a different number" : "Use a different address"}
          </Button>
        </form>
      )}
    </Card>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
    >
      {message}
    </p>
  );
}
