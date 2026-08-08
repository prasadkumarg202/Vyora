"use client";

import { formatPaise, rupeesToPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listAccountEntries,
  listAccounts,
  listCheques,
  saveAccount,
  saveAccountEntry,
  setChequeStatus,
  transferBetweenAccounts,
  type AccountEntryRow,
  type AccountKind,
  type AccountRow,
} from "~/lib/db/repository";

/**
 * Cash & Bank — where the money actually sits.
 *
 * Four things a shop juggles daily, on one screen: the cash in the drawer, the
 * bank accounts, cheques waiting to clear, and any loan being repaid. Balances
 * are summed from movements every time they are read, never stored, so the
 * number on screen is the number in the drawer.
 *
 * One rule worth stating: an uncleared cheque does NOT count towards a balance.
 * Money promised is not money held, and the shopkeeper who spends against a
 * cheque that later bounces is exactly who this protects.
 */

type Tab = "accounts" | "cheques" | "loans";

const TABS: { key: Tab; label: string; blurb: string }[] = [
  {
    key: "accounts",
    label: "Cash & accounts",
    blurb: "Counter cash and bank accounts, with what is in each right now.",
  },
  {
    key: "cheques",
    label: "Cheques",
    blurb:
      "Cheques given and received — mark them cleared or bounced as they settle.",
  },
  {
    key: "loans",
    label: "Loans",
    blurb: "What you have borrowed and what is still to repay.",
  },
];

const KINDS: { value: AccountKind; label: string; icon: string }[] = [
  { value: "cash", label: "Cash in hand", icon: "💵" },
  { value: "bank", label: "Bank account", icon: "🏦" },
  { value: "card", label: "Card / wallet", icon: "💳" },
];

function paiseOf(rupees: string): Paise {
  const n = Number((rupees ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}

/** Only the last four digits are ever shown — the rest stays for the invoice. */
const maskAccount = (n: string | null): string =>
  n && n.length > 4 ? `••••${n.slice(-4)}` : (n ?? "");

export function CashModule({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}) {
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [entries, setEntries] = useState<AccountEntryRow[]>([]);
  const [cheques, setCheques] = useState<AccountEntryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // New account
  const [showNew, setShowNew] = useState(false);
  const [kind, setKind] = useState<AccountKind>("bank");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [opening, setOpening] = useState("");

  // Money in / out
  const [moveAccount, setMoveAccount] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");

  // Transfer
  const [fromAcc, setFromAcc] = useState("");
  const [toAcc, setToAcc] = useState("");
  const [transferAmt, setTransferAmt] = useState("");

  // Cheque
  const [chqAccount, setChqAccount] = useState("");
  const [chqDirection, setChqDirection] = useState<"in" | "out">("in");
  const [chqNo, setChqNo] = useState("");
  const [chqAmount, setChqAmount] = useState("");
  const [chqDue, setChqDue] = useState("");
  const [chqParty, setChqParty] = useState("");

  // Loan
  const [loanName, setLoanName] = useState("");
  const [loanPrincipal, setLoanPrincipal] = useState("");
  const [loanEmi, setLoanEmi] = useState("");
  const [emiAccount, setEmiAccount] = useState("");
  const [emiAmount, setEmiAmount] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [acc, ent, chq] = await Promise.all([
        listAccounts(orgId),
        listAccountEntries(orgId, undefined, 40),
        listCheques(orgId),
      ]);
      setAccounts(acc);
      setEntries(ent);
      setCheques(chq);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function say(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 3000);
  }

  const money = accounts?.filter((a) => a.kind !== "loan") ?? [];
  const loans = accounts?.filter((a) => a.kind === "loan") ?? [];
  const totalInHand = useMemo(
    () => money.reduce((sum, a) => sum + a.balance_paise, 0),
    [money],
  );
  const totalOwed = useMemo(
    () => loans.reduce((sum, a) => sum + a.balance_paise, 0),
    [loans],
  );
  const pendingCheques = cheques.filter((c) => c.cheque_status === "pending");

  async function addAccount() {
    if (!name.trim()) {
      setError("Give the account a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bank = bankName.trim();
      const accountNumber = accountNo.trim();
      const code = ifsc.trim().toUpperCase();
      await saveAccount({
        id: crypto.randomUUID(),
        orgId,
        name: name.trim(),
        kind,
        // Left out entirely rather than set to undefined. Under
        // exactOptionalPropertyTypes an absent optional field and one holding
        // undefined are different types, and "the shop did not fill this in"
        // means absent.
        ...(bank ? { bankName: bank } : {}),
        ...(accountNumber ? { accountNumber } : {}),
        ...(code ? { ifsc: code } : {}),
        openingPaise: paiseOf(opening),
      });
      setName("");
      setBankName("");
      setAccountNo("");
      setIfsc("");
      setOpening("");
      setShowNew(false);
      say("Account added.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveMoney(direction: "in" | "out") {
    const amount = paiseOf(moveAmount);
    if (!moveAccount || amount <= 0) {
      setError("Choose an account and an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAccountEntry({
        orgId,
        accountId: moveAccount,
        direction,
        amountPaise: amount,
        note: moveNote.trim() || undefined,
        category: direction === "in" ? "deposit" : "withdrawal",
        createdBy: userId,
      });
      setMoveAmount("");
      setMoveNote("");
      say(`${formatPaise(amount)} recorded.`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doTransfer() {
    const amount = paiseOf(transferAmt);
    if (!fromAcc || !toAcc || fromAcc === toAcc || amount <= 0) {
      setError("Pick two different accounts and an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await transferBetweenAccounts({
        orgId,
        fromAccountId: fromAcc,
        toAccountId: toAcc,
        amountPaise: amount,
        createdBy: userId,
      });
      setTransferAmt("");
      say(`${formatPaise(amount)} moved.`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addCheque() {
    const amount = paiseOf(chqAmount);
    if (!chqAccount || amount <= 0) {
      setError("Choose an account and an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAccountEntry({
        orgId,
        accountId: chqAccount,
        direction: chqDirection,
        amountPaise: amount,
        instrument: "cheque",
        chequeNo: chqNo.trim() || undefined,
        chequeStatus: "pending",
        dueDate: chqDue || undefined,
        note: chqParty.trim() || undefined,
        category: "cheque",
        createdBy: userId,
      });
      setChqNo("");
      setChqAmount("");
      setChqDue("");
      setChqParty("");
      say("Cheque recorded — it will count once you mark it cleared.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function settleCheque(entryId: string, status: "cleared" | "bounced") {
    setBusy(true);
    try {
      await setChequeStatus({ orgId, entryId, status });
      say(
        status === "cleared"
          ? "Marked cleared — balance updated."
          : "Marked bounced.",
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addLoan() {
    const principal = paiseOf(loanPrincipal);
    if (!loanName.trim() || principal <= 0) {
      setError("Give the loan a name and the amount borrowed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      await saveAccount({
        id,
        orgId,
        name: loanName.trim(),
        kind: "loan",
        principalPaise: principal,
        emiPaise: paiseOf(loanEmi),
      });
      // The borrowing itself: what is owed starts at the principal.
      await saveAccountEntry({
        orgId,
        accountId: id,
        direction: "in",
        amountPaise: principal,
        category: "principal",
        note: "Loan taken",
        createdBy: userId,
      });
      setLoanName("");
      setLoanPrincipal("");
      setLoanEmi("");
      say("Loan added.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function payEmi(loan: AccountRow) {
    const amount =
      paiseOf(emiAmount) || (loan.emi_paise as Paise) || (0 as Paise);
    if (amount <= 0) {
      setError("Enter the instalment amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Two sides: the loan shrinks, and the money leaves an account.
      await saveAccountEntry({
        orgId,
        accountId: loan.id,
        direction: "out",
        amountPaise: amount,
        category: "emi",
        note: "Instalment paid",
        createdBy: userId,
      });
      if (emiAccount) {
        await saveAccountEntry({
          orgId,
          accountId: emiAccount,
          direction: "out",
          amountPaise: amount,
          category: "emi",
          note: `EMI · ${loan.name}`,
          createdBy: userId,
        });
      }
      setEmiAmount("");
      say(`${formatPaise(amount)} repaid.`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Cash &amp; Bank</h1>
        <p className="text-body text-content-muted">
          Every rupee, and which pocket it is in — the drawer, the bank, a
          cheque still to clear, or a loan still to repay.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="In hand & in bank"
          value={formatPaise(totalInHand as Paise)}
        />
        <Stat
          label="Cheques not yet cleared"
          value={formatPaise(
            pendingCheques.reduce((s, c) => s + c.amount_paise, 0) as Paise,
          )}
          foot={`${pendingCheques.length} cheque${pendingCheques.length === 1 ? "" : "s"}`}
          tone={pendingCheques.length ? "warn" : undefined}
        />
        <Stat
          label="Loans outstanding"
          value={formatPaise(totalOwed as Paise)}
          tone={totalOwed > 0 ? "warn" : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-control border px-4 py-2 text-body font-medium transition-colors " +
              (tab === t.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-content-muted hover:border-primary hover:text-primary")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-body text-content-muted">{current.blurb}</p>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}
      {flash ? <p className="text-body text-success">{flash}</p> : null}

      {/* ---------- Accounts ---------- */}
      {tab === "accounts" ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h3">Your accounts</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNew((v) => !v)}
              >
                {showNew ? "Cancel" : "+ Add account"}
              </Button>
            </div>

            {showNew ? (
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      onClick={() => setKind(k.value)}
                      className={
                        "rounded-control border px-3 py-2 text-body font-medium " +
                        (kind === k.value
                          ? "border-primary bg-primary-tonal text-primary"
                          : "border-border bg-canvas text-content-muted")
                      }
                    >
                      {k.icon} {k.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id="acc-name"
                    label="Name *"
                    value={name}
                    set={setName}
                    placeholder={
                      kind === "cash" ? "Counter cash" : "HDFC current account"
                    }
                  />
                  <Field
                    id="acc-open"
                    label="Opening balance"
                    value={opening}
                    set={setOpening}
                    numeric
                    placeholder="0.00"
                  />
                  {kind === "bank" ? (
                    <>
                      <Field
                        id="acc-bank"
                        label="Bank"
                        value={bankName}
                        set={setBankName}
                        placeholder="HDFC Bank"
                      />
                      <Field
                        id="acc-no"
                        label="Account number"
                        value={accountNo}
                        set={setAccountNo}
                        placeholder="For your invoice footer"
                      />
                      <Field
                        id="acc-ifsc"
                        label="IFSC"
                        value={ifsc}
                        set={setIfsc}
                        placeholder="HDFC0001234"
                      />
                    </>
                  ) : null}
                </div>
                <Button
                  onClick={addAccount}
                  disabled={busy}
                  className="self-start"
                >
                  {busy ? "Saving…" : "Add account"}
                </Button>
              </Card>
            ) : null}

            {accounts === null ? (
              <p className="text-body text-content-muted">Loading…</p>
            ) : money.length === 0 ? (
              <EmptyState
                title="No accounts yet"
                description="Add your counter cash and your bank account — then every payment can say which pocket it went into."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {money.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card"
                  >
                    <span className="text-caption font-medium uppercase text-content-muted">
                      {KINDS.find((k) => k.value === a.kind)?.icon ?? "🏦"}{" "}
                      {a.name}
                    </span>
                    <span
                      className={
                        "font-mono text-h2 " +
                        (a.balance_paise < 0 ? "text-danger" : "text-content")
                      }
                    >
                      {formatPaise(a.balance_paise as Paise)}
                    </span>
                    <span className="text-caption normal-case text-content-muted">
                      {a.bank_name
                        ? `${a.bank_name} ${maskAccount(a.account_number)}`
                        : "Cash on hand"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {money.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="flex flex-col gap-3 p-5">
                <h2 className="text-h3">Money in or out</h2>
                <AccountPicker
                  id="mv-acc"
                  label="Account"
                  value={moveAccount}
                  set={setMoveAccount}
                  options={money}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id="mv-amt"
                    label="Amount"
                    value={moveAmount}
                    set={setMoveAmount}
                    numeric
                    placeholder="0.00"
                  />
                  <Field
                    id="mv-note"
                    label="What for"
                    value={moveNote}
                    set={setMoveNote}
                    placeholder="Owner drawing, rent…"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => void moveMoney("in")} disabled={busy}>
                    Money in
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void moveMoney("out")}
                    disabled={busy}
                  >
                    Money out
                  </Button>
                </div>
              </Card>

              <Card className="flex flex-col gap-3 p-5">
                <h2 className="text-h3">Move between accounts</h2>
                <p className="text-body text-content-muted">
                  Banking the day&apos;s cash, or drawing cash out.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AccountPicker
                    id="tr-from"
                    label="From"
                    value={fromAcc}
                    set={setFromAcc}
                    options={money}
                  />
                  <AccountPicker
                    id="tr-to"
                    label="To"
                    value={toAcc}
                    set={setToAcc}
                    options={money}
                  />
                </div>
                <Field
                  id="tr-amt"
                  label="Amount"
                  value={transferAmt}
                  set={setTransferAmt}
                  numeric
                  placeholder="0.00"
                />
                <Button
                  onClick={doTransfer}
                  disabled={busy}
                  className="self-start"
                >
                  Move money
                </Button>
              </Card>
            </div>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-h3">Recent movements</h2>
            {entries.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                description="Money in, money out and transfers will appear here."
              />
            ) : (
              <Card className="divide-y divide-border p-0">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="flex flex-col">
                      <span className="text-body font-medium">
                        {e.note || e.category || "Movement"}
                      </span>
                      <span className="text-caption normal-case text-content-muted">
                        {e.date} · {e.account_name}
                        {e.cheque_status ? ` · cheque ${e.cheque_status}` : ""}
                      </span>
                    </div>
                    <span
                      className={
                        "font-mono text-body-lg " +
                        (e.direction === "in" ? "text-success" : "text-content")
                      }
                    >
                      {e.direction === "in" ? "+" : "−"}{" "}
                      {formatPaise(e.amount_paise as Paise)}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      ) : null}

      {/* ---------- Cheques ---------- */}
      {tab === "cheques" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">Record a cheque</h2>
            <div className="flex gap-2">
              {(["in", "out"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setChqDirection(d)}
                  className={
                    "rounded-control border px-3 py-2 text-body font-medium " +
                    (chqDirection === d
                      ? "border-primary bg-primary-tonal text-primary"
                      : "border-border bg-canvas text-content-muted")
                  }
                >
                  {d === "in" ? "Received" : "Given"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AccountPicker
                id="chq-acc"
                label="Account"
                value={chqAccount}
                set={setChqAccount}
                options={money}
              />
              <Field
                id="chq-no"
                label="Cheque number"
                value={chqNo}
                set={setChqNo}
                placeholder="000123"
              />
              <Field
                id="chq-amt"
                label="Amount"
                value={chqAmount}
                set={setChqAmount}
                numeric
                placeholder="0.00"
              />
              <Field
                id="chq-party"
                label="Party"
                value={chqParty}
                set={setChqParty}
                placeholder="Who it is from / to"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="chq-due">Dated</Label>
                <input
                  id="chq-due"
                  type="date"
                  value={chqDue}
                  onChange={(e) => setChqDue(e.target.value)}
                  className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
                />
              </div>
            </div>
            <Button onClick={addCheque} disabled={busy} className="self-start">
              {busy ? "Saving…" : "Record cheque"}
            </Button>
            <p className="text-caption normal-case text-content-muted">
              A cheque counts towards your balance only once you mark it
              cleared.
            </p>
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="text-h3">Cheques</h2>
            {cheques.length === 0 ? (
              <EmptyState
                title="No cheques recorded"
                description="Cheques you give or receive will be tracked here until they settle."
              />
            ) : (
              <Card className="divide-y divide-border p-0">
                {cheques.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="flex flex-col">
                      <span className="text-body font-medium">
                        {c.cheque_no ? `#${c.cheque_no}` : "Cheque"} ·{" "}
                        {c.note ||
                          (c.direction === "in" ? "Received" : "Given")}
                      </span>
                      <span className="text-caption normal-case text-content-muted">
                        {c.due_date ? `Dated ${c.due_date}` : c.date} ·{" "}
                        {c.account_name}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge
                        tone={
                          c.cheque_status === "cleared"
                            ? "success"
                            : c.cheque_status === "bounced"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {c.cheque_status}
                      </Badge>
                      <span className="font-mono text-body-lg">
                        {formatPaise(c.amount_paise as Paise)}
                      </span>
                      {c.cheque_status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void settleCheque(c.id, "cleared")}
                            disabled={busy}
                          >
                            Cleared
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void settleCheque(c.id, "bounced")}
                            disabled={busy}
                          >
                            Bounced
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      ) : null}

      {/* ---------- Loans ---------- */}
      {tab === "loans" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">Add a loan</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                id="ln-name"
                label="Lender / purpose *"
                value={loanName}
                set={setLoanName}
                placeholder="Shop loan — SBI"
              />
              <Field
                id="ln-amt"
                label="Amount borrowed *"
                value={loanPrincipal}
                set={setLoanPrincipal}
                numeric
                placeholder="0.00"
              />
              <Field
                id="ln-emi"
                label="Monthly instalment"
                value={loanEmi}
                set={setLoanEmi}
                numeric
                placeholder="0.00"
              />
            </div>
            <Button onClick={addLoan} disabled={busy} className="self-start">
              {busy ? "Saving…" : "Add loan"}
            </Button>
          </Card>

          {loans.length === 0 ? (
            <EmptyState
              title="No loans recorded"
              description="Add one to track what is left to repay, instalment by instalment."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {loans.map((l) => (
                <Card key={l.id} className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-body-lg font-semibold">
                        {l.name}
                      </span>
                      <span className="text-caption normal-case text-content-muted">
                        Borrowed{" "}
                        {formatPaise((l.principal_paise ?? 0) as Paise)}
                        {l.emi_paise
                          ? ` · instalment ${formatPaise(l.emi_paise as Paise)}`
                          : ""}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-caption font-medium uppercase text-content-muted">
                        Still to repay
                      </span>
                      <span className="font-mono text-h2 text-warning">
                        {formatPaise(l.balance_paise as Paise)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
                    <Field
                      id={`emi-${l.id}`}
                      label="Instalment amount"
                      value={emiAmount}
                      set={setEmiAmount}
                      numeric
                      placeholder={
                        l.emi_paise
                          ? String((l.emi_paise / 100).toFixed(2))
                          : "0.00"
                      }
                    />
                    <AccountPicker
                      id={`emi-acc-${l.id}`}
                      label="Paid from"
                      value={emiAccount}
                      set={setEmiAccount}
                      options={money}
                    />
                    <Button onClick={() => void payEmi(l)} disabled={busy}>
                      Record repayment
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot?: string | undefined;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">
        {label}
      </span>
      <span
        className={
          "font-mono text-h2 " +
          (tone === "warn" ? "text-warning" : "text-content")
        }
      >
        {value}
      </span>
      {foot ? (
        <span className="text-caption normal-case text-content-muted">
          {foot}
        </span>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  set,
  placeholder,
  numeric,
}: {
  id: string;
  label: string;
  value: string;
  set: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        className={numeric ? "text-right font-mono" : undefined}
        onChange={(e) =>
          set(numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)
        }
      />
    </div>
  );
}

function AccountPicker({
  id,
  label,
  value,
  set,
  options,
}: {
  id: string;
  label: string;
  value: string;
  set: (v: string) => void;
  options: AccountRow[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
      >
        <option value="">Select…</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
