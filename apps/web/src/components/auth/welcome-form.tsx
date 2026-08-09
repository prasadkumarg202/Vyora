"use client";

import {
  INDIAN_STATES,
  gstinPan,
  gstinStateCode,
  isValidGstin,
  isValidPan,
  parseRupees,
  stateCodeFor,
} from "@vyora/core";
import { Button, Card, Input, Label } from "@vyora/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { createWorkspace } from "~/lib/auth/actions";
import { saveProduct } from "~/lib/db/repository";
import { savePreference } from "~/lib/settings";

interface BusinessType {
  key: string;
  label: string;
}

/**
 * Onboarding, in four steps.
 *
 *   1. Business    — who you are, and which trade. The trade answer reshapes
 *                    every field in the app, so it is the one that matters.
 *   2. Address     — what prints at the top of an invoice.
 *   3. First items — the five things you sell all day.
 *   4. Start       — bill, import, or look around.
 *
 * Two decisions worth stating, because both are easy to get wrong:
 *
 * GSTIN is optional. Most of the shops this is built for are below the
 * registration threshold, and an onboarding that demands a GSTIN turns them
 * away on the first screen. Leaving it blank is a real answer with a real
 * consequence — GST is switched off for the workspace, so an unregistered shop
 * bills without tax instead of printing a tax invoice it may not issue.
 *
 * Step 3 writes straight to the local ledger, because that is where products
 * live: the till reads them offline and the outbox syncs them later. It is
 * skippable — a shop that would rather start billing should be allowed to.
 */
export function WelcomeForm({
  businessTypes,
  phone,
  email,
}: {
  businessTypes: BusinessType[];
  /**
   * A phone number already verified on the account, if there is one. Sign-in is
   * by email code, so for almost every shop this is null and the field below is
   * theirs to fill in.
   */
  phone: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // --- Step 1
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState(email ?? "");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [state, setState] = useState("Telangana");
  const [type, setType] = useState(businessTypes[0]?.key ?? "");

  // --- Step 2
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  const gstinWarnings = checkGstin(gstin, pan, state);
  // Editable unless the account already carries a verified number.
  const [phoneInput, setPhoneInput] = useState(phone ?? "");

  const canContinue = name.trim().length >= 2 && Boolean(type);

  function submitProfile() {
    setError(null);
    startTransition(async () => {
      const result = await createWorkspace({
        name,
        businessTypeKey: type || undefined,
        phone: (phone ?? phoneInput.trim()) || undefined,
        email: contactEmail || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        state,
        stateCode: stateCodeFor(state) ?? undefined,
        addressLine1: line1 || undefined,
        addressLine2: line2 || undefined,
        city: city || undefined,
        pincode: pincode || undefined,
      });

      if (!result.ok) {
        setError(result.error ?? "Could not create the workspace.");
        return;
      }

      // No GSTIN means not registered, which means no tax on the bill. Storing
      // the answer is not enough — it has to change what the app does, or the
      // question was asked for nothing.
      if (!gstin.trim()) {
        await savePreference("gstEnabled", false);
        await savePreference("hsnEnabled", false);
      }

      setOrgId(result.orgId ?? null);
      setStep(result.orgId ? 3 : 4);
      router.refresh();
    });
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-5 p-6">
        <Stepper current={step} />

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <Field label="Business Name" htmlFor="business-name" required>
              <Input
                id="business-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Sri Sai Medicals"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone Number" htmlFor="phone">
                <Input
                  id="phone"
                  value={phoneInput}
                  onChange={(e) =>
                    setPhoneInput(e.target.value.replace(/[^\d+]/g, "").slice(0, 15))
                  }
                  readOnly={Boolean(phone)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                  aria-describedby="phone-note"
                  className={
                    phone ? "bg-canvas font-mono text-content-muted" : "font-mono"
                  }
                />
                <span
                  id="phone-note"
                  className="text-caption normal-case text-content-muted"
                >
                  {phone
                    ? "Verified on your account — this is the number that owns it."
                    : "Printed on your bills, and where customers reply. You can add it later."}
                </span>
              </Field>

              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="optional"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GSTIN" htmlFor="gstin">
                <Input
                  id="gstin"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="Leave blank if not registered"
                  spellCheck={false}
                />
              </Field>

              <Field label="PAN" htmlFor="pan">
                <Input
                  id="pan"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="optional"
                  spellCheck={false}
                />
              </Field>
            </div>

            {gstinWarnings.length > 0 ? (
              <ul
                data-testid="gstin-warnings"
                className="flex flex-col gap-1 rounded-control border border-warning-border bg-warning-tonal px-3 py-2"
              >
                {gstinWarnings.map((w) => (
                  <li key={w} className="text-body text-warning">
                    {w}
                  </li>
                ))}
                <li className="text-caption normal-case text-content-muted">
                  You can continue — but a wrong GSTIN prints on every invoice
                  you issue.
                </li>
              </ul>
            ) : null}

            <Field label="Base State" htmlFor="state" required>
              <Select
                id="state"
                value={state}
                onChange={setState}
                options={INDIAN_STATES.map((s) => ({
                  value: s.name,
                  label: `${s.name} (${s.code})`,
                }))}
              />
            </Field>

            <Field
              label="Business Type / Industry"
              htmlFor="business-type"
              required
            >
              <Select
                id="business-type"
                value={type}
                onChange={setType}
                options={businessTypes.map((b) => ({
                  value: b.key,
                  label: b.label,
                }))}
              />
              <span className="text-caption normal-case text-content-muted">
                This reshapes every screen — fields, GST slabs, invoice columns
                and reports. Changeable later in Settings.
              </span>
            </Field>

            <Button
              onClick={() => setStep(2)}
              disabled={!canContinue}
              data-testid="onboard-next"
            >
              Next
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <p className="text-body text-content-muted">
              This prints at the top of every invoice. Editable later in
              Settings.
            </p>

            <Field label="Address" htmlFor="line1">
              <Input
                id="line1"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                autoFocus
                placeholder="Shop no., building, street"
              />
            </Field>

            <Field label="Area / Landmark" htmlFor="line2">
              <Input
                id="line2"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder="optional"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Field>
              <Field label="PIN code" htmlFor="pincode">
                <Input
                  id="pincode"
                  value={pincode}
                  onChange={(e) =>
                    setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  placeholder="6 digits"
                />
              </Field>
            </div>

            <p className="text-caption normal-case text-content-muted">
              State: {state} — set on the previous step, because it decides
              CGST/SGST versus IGST on every bill.
            </p>

            {error ? (
              <p
                role="alert"
                className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
              >
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                onClick={submitProfile}
                disabled={pending}
                data-testid="onboard-create"
                className="flex-1"
              >
                {pending ? "Creating…" : "Create workspace"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 && orgId ? (
          <FirstItems
            orgId={orgId}
            gstEnabled={Boolean(gstin.trim())}
            onDone={() => setStep(4)}
          />
        ) : null}

        {step === 4 ? <GetStarted router={router} /> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding progress">
      {[1, 2, 3, 4].map((n, i) => (
        <li key={n} className="flex flex-1 items-center gap-2">
          <span
            aria-current={n === current ? "step" : undefined}
            data-testid={`step-${n}`}
            data-state={
              n === current ? "current" : n < current ? "done" : "todo"
            }
            className={
              "flex size-8 shrink-0 items-center justify-center rounded-pill text-body font-medium " +
              (n === current
                ? "bg-primary text-primary-content"
                : n < current
                  ? "bg-primary-tonal text-primary"
                  : "bg-canvas text-content-muted")
            }
          >
            {n}
          </span>
          {i < 3 ? <span className="h-px flex-1 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Step 3 — the items this shop sells all day.
 *
 * Written to the local ledger rather than the server, because that is where
 * products live: the till reads them offline and the outbox syncs them when
 * there is a network. It also means this step works on a counter PC that has
 * not seen the internet since the OTP.
 */
function FirstItems({
  orgId,
  gstEnabled,
  onDone,
}: {
  orgId: string;
  gstEnabled: boolean;
  onDone: () => void;
}) {
  const [rows, setRows] = useState(() =>
    Array.from({ length: 5 }, () => ({ name: "", price: "", gst: "" })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = rows.filter((r) => r.name.trim() && r.price.trim());

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const row of filled) {
        await saveProduct({
          id: crypto.randomUUID(),
          orgId,
          name: row.name.trim(),
          pricePaise: parseRupees(row.price),
          taxBps: gstEnabled ? Math.round(Number(row.gst || "0") * 100) : 0,
          openingMilli: 0,
        });
      }
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save those items. You can add them later.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">What do you sell most?</h2>
        <p className="text-body text-content-muted">
          Five is plenty to start. These become your till&apos;s quick keys —
          one press to bill them — and the rest can wait.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_5rem] gap-2">
            <Input
              aria-label={`Item ${i + 1} name`}
              value={row.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder={i === 0 ? "Sugar 1kg" : "Item name"}
            />
            <Input
              aria-label={`Item ${i + 1} price`}
              value={row.price}
              onChange={(e) => setRow(i, { price: e.target.value })}
              inputMode="decimal"
              placeholder="₹ price"
            />
            <Input
              aria-label={`Item ${i + 1} GST`}
              value={row.gst}
              onChange={(e) => setRow(i, { gst: e.target.value })}
              inputMode="decimal"
              placeholder={gstEnabled ? "GST %" : "—"}
              disabled={!gstEnabled}
            />
          </div>
        ))}
      </div>

      {!gstEnabled ? (
        <p className="text-caption normal-case text-content-muted">
          No GSTIN, so GST is off and these are priced without tax. Add a GSTIN
          in Settings later and it comes back on.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Skip for now
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || filled.length === 0}
          data-testid="onboard-save-items"
          className="flex-1"
        >
          {saving
            ? "Saving…"
            : filled.length === 1
              ? "Add 1 item"
              : `Add ${filled.length} items`}
        </Button>
      </div>
    </div>
  );
}

/** Step 4 — one screen, no video, no sales call. */
function GetStarted({ router }: { router: ReturnType<typeof useRouter> }) {
  const routes = [
    {
      href: "/sales" as const,
      title: "Create your first invoice",
      blurb: "Bill a customer now. Everything else can wait.",
    },
    {
      href: "/import" as const,
      title: "Import your data",
      blurb: "Bring items and customers over from Vyapar, myBillBook or Tally.",
    },
    {
      href: "/dashboard" as const,
      title: "Look around first",
      blurb: "Open the dashboard and explore at your own pace.",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">
          You&apos;re set up. How would you like to start?
        </h2>
        <p className="text-body text-content-muted">
          Your workspace is ready and everything is saved on this device.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {routes.map((route) => (
          <button
            key={route.href}
            type="button"
            data-testid={`start-${route.href.slice(1)}`}
            onClick={() => router.push(route.href)}
            className="flex flex-col gap-0.5 rounded-card border border-border bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-primary-tonal"
          >
            <span className="text-body font-medium text-content">
              {route.title}
            </span>
            <span className="text-caption normal-case text-content-muted">
              {route.blurb}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none transition-colors focus-visible:border-primary focus-visible:shadow-focus"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/**
 * What is wrong with this GSTIN, in plain words.
 *
 * A GSTIN is `<state><PAN><entity><Z><check>`, so it already contains two of
 * the other answers on this screen. Reading them back catches the typo here
 * rather than on three months of invoices.
 *
 * It only warns. A shop with an edge case we have not thought of — a recent
 * PAN change, a registration in another state — must never be blocked from
 * signing up by our arithmetic.
 */
function checkGstin(gstin: string, pan: string, state: string): string[] {
  const value = gstin.trim().toUpperCase();
  const typed = pan.trim().toUpperCase();
  const warnings: string[] = [];

  if (typed && !isValidPan(typed)) {
    warnings.push("A PAN is five letters, four digits and a letter.");
  }

  if (!value) return warnings;

  if (value.length !== 15) {
    warnings.push("A GSTIN is 15 characters.");
    return warnings;
  }
  if (!isValidGstin(value)) {
    warnings.push("This GSTIN's check digit does not match — likely a typo.");
  }

  const expected = stateCodeFor(state);
  const actual = gstinStateCode(value);
  if (expected && actual && expected !== actual) {
    warnings.push(
      `This GSTIN is registered in state ${actual}, but the base state is ${state} (${expected}).`,
    );
  }

  const embedded = gstinPan(value);
  if (embedded && typed && embedded !== typed) {
    warnings.push(
      `The PAN inside this GSTIN is ${embedded}, which does not match the PAN entered.`,
    );
  }

  return warnings;
}
