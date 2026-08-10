"use client";

import { formatPaise, rupeesToPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  advancesForMonth,
  attendanceForMonth,
  listStaff,
  markAttendance,
  markStaffLeft,
  payslipsForMonth,
  saveAdvance,
  saveStaff,
  type AdvanceKind,
  type AdvanceRow,
  type AttendanceRow,
  type AttendanceStatus,
  type PayslipLine,
  type StaffRow,
} from "~/lib/db/payroll";
import { requestSync } from "~/lib/sync/runner";

/**
 * Staff — attendance, advances and the month's pay.
 *
 * Built to replace the notebook, not an HR system. A shop with four people needs
 * to know who came in, who has taken money against their wage, and what goes in
 * the envelope on the first. Everything here answers one of those three.
 *
 * Attendance is the screen that gets opened daily, so it is first and it is one
 * tap per person. The payslip is derived every time it is shown — see
 * `payslipsForMonth` — so fixing a wrongly-marked day fixes the slip, and there
 * is never a stored total sitting behind it disagreeing.
 */

const STATUSES: readonly { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: "present", label: "Present", tone: "bg-success-tonal text-success border-success-border" },
  { value: "half_day", label: "Half day", tone: "bg-warning-tonal text-warning border-warning-border" },
  { value: "absent", label: "Absent", tone: "bg-danger-tonal text-danger border-danger-border" },
  { value: "leave", label: "Leave", tone: "bg-info-tonal text-info border-info-border" },
];

const rupee = (p: number) => formatPaise(p as Paise);

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Human month label, e.g. "August 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return monthOf(new Date(y, m - 1 + by, 1));
}

export function StaffModule({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}) {
  const today = ymd(new Date());

  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [day, setDay] = useState(today);
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [slips, setSlips] = useState<PayslipLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, a, adv, p] = await Promise.all([
        listStaff(orgId),
        attendanceForMonth(orgId, month),
        advancesForMonth(orgId, month),
        payslipsForMonth(orgId, month),
      ]);
      setStaff(s);
      setAttendance(a);
      setAdvances(adv);
      setSlips(p);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, month]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** What each person is marked as on the selected day. */
  const marksToday = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const a of attendance) {
      if (a.date === day) map.set(a.staff_id, a.status);
    }
    return map;
  }, [attendance, day]);

  async function mark(staffId: string, status: AttendanceStatus) {
    setBusy(staffId);
    setError(null);
    try {
      await markAttendance({ orgId, staffId, date: day, status });
      await refresh();
      requestSync();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Mark everyone present in one action — the normal morning. */
  async function markAllPresent() {
    if (!staff) return;
    setBusy("all");
    setError(null);
    try {
      // Sequential rather than parallel: these are upserts against the same
      // table on one connection, and a stampede buys nothing at this size.
      for (const s of staff) {
        if (!marksToday.has(s.id)) {
          await markAttendance({
            orgId,
            staffId: s.id,
            date: day,
            status: "present",
          });
        }
      }
      await refresh();
      requestSync();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const unmarked = staff ? staff.filter((s) => !marksToday.has(s.id)).length : 0;
  const monthTotal = slips.reduce((n, s) => n + s.netPaise, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Staff</h1>
          <p className="text-body text-content-muted">
            Attendance, advances and the month&apos;s pay. Saves on this device,
            syncs when online.
          </p>
        </div>
        <Badge tone="primary">{monthLabel(month)}</Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Month, with presets — a shopkeeper reaching for last month should not
          have to open a date picker to find it. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ← Previous
        </Button>
        <Button
          variant={month === monthOf(new Date()) ? "primary" : "outline"}
          size="sm"
          onClick={() => setMonth(monthOf(new Date()))}
        >
          This month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth(shiftMonth(monthOf(new Date()), -1))}
        >
          Last month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= monthOf(new Date())}
        >
          Next →
        </Button>
      </div>

      {/* --- Attendance ---------------------------------------------------- */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3">Attendance</h2>
            <p className="text-caption normal-case text-content-muted">
              {unmarked > 0
                ? `${unmarked} still to mark for this day.`
                : "Everyone is marked for this day."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="att-day">Day</Label>
              <Input
                id="att-day"
                type="date"
                value={day}
                max={today}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setDay(today)}>
              Today
            </Button>
            <Button
              size="sm"
              onClick={() => void markAllPresent()}
              disabled={busy !== null || unmarked === 0}
            >
              {busy === "all" ? "Marking…" : "All present"}
            </Button>
          </div>
        </div>

        {staff === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : staff.length === 0 ? (
          <EmptyState
            title="No staff yet"
            description="Add the people you pay — then marking the morning takes one tap each."
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-border">
            {staff.map((s) => {
              const current = marksToday.get(s.id);
              return (
                <div
                  key={s.id}
                  data-testid="staff-attendance-row"
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-body font-medium text-content">
                      {s.name}
                    </span>
                    <span className="text-caption normal-case text-content-muted">
                      {s.role ?? "Staff"} ·{" "}
                      {s.is_daily_wage === 1
                        ? `${rupee(s.salary_paise)} a day`
                        : `${rupee(s.salary_paise)} a month`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {STATUSES.map((st) => {
                      const on = current === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void mark(s.id, st.value)}
                          aria-pressed={on}
                          className={
                            "rounded-pill border px-3 py-1 text-caption transition-colors disabled:opacity-50 " +
                            (on
                              ? st.tone
                              : "border-border bg-surface text-content-muted hover:border-primary hover:text-primary")
                          }
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* --- People -------------------------------------------------------- */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3">People</h2>
          <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "+ Add staff"}
          </Button>
        </div>

        {adding ? (
          <NewStaffForm
            orgId={orgId}
            onDone={() => {
              setAdding(false);
              void refresh();
            }}
          />
        ) : null}

        {staff && staff.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {staff.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-body font-medium">{s.name}</span>
                  <span className="text-caption normal-case text-content-muted">
                    {s.phone ?? "No phone"}
                    {s.joined_on ? ` · joined ${s.joined_on}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {s.dirty ? (
                    <Badge tone="warning" dot>
                      Unsynced
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void markStaffLeft({ orgId, staffId: s.id, on: today }).then(
                        refresh,
                      );
                    }}
                  >
                    Mark left
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* --- Advances ------------------------------------------------------ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-h3">Advances &amp; deductions</h2>
        {staff && staff.length > 0 ? (
          <NewAdvanceForm
            orgId={orgId}
            userId={userId}
            staff={staff}
            month={month}
            onDone={refresh}
          />
        ) : (
          <p className="text-body text-content-muted">Add staff first.</p>
        )}

        {advances.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {advances.map((a) => {
              const person = staff?.find((s) => s.id === a.staff_id);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-body">{person?.name ?? "Staff"}</span>
                    <span className="text-caption normal-case text-content-muted">
                      {a.date}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={a.kind === "bonus" ? "success" : "neutral"}>
                      {a.kind}
                    </Badge>
                    <span className="font-mono text-body">
                      {rupee(a.amount_paise)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-caption normal-case text-content-muted">
            Nothing recorded for {monthLabel(month)}.
          </p>
        )}
      </Card>

      {/* --- Payslips ------------------------------------------------------ */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3">Pay for {monthLabel(month)}</h2>
          <span className="text-body text-content-muted">
            Total{" "}
            <span className="font-mono text-body-lg text-content">
              {rupee(monthTotal)}
            </span>
          </span>
        </div>

        {slips.length === 0 ? (
          <p className="text-body text-content-muted">
            Nothing to pay yet — mark some attendance first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <Th>Name</Th>
                  <Th right>Days</Th>
                  <Th right>Earned</Th>
                  <Th right>OT</Th>
                  <Th right>Advance</Th>
                  <Th right>Bonus</Th>
                  <Th right>Net pay</Th>
                </tr>
              </thead>
              <tbody>
                {slips.map((p) => (
                  <tr
                    key={p.staffId}
                    className="border-b border-border-subtle last:border-b-0"
                    data-testid="payslip-row"
                  >
                    <td className="py-2 pr-2 text-body">{p.name}</td>
                    <Td>{p.daysWorked}</Td>
                    <Td>{rupee(p.earnedPaise)}</Td>
                    <Td>{p.otPaise > 0 ? rupee(p.otPaise) : "—"}</Td>
                    <Td>
                      {p.advancesPaise + p.deductionsPaise > 0
                        ? `- ${rupee(p.advancesPaise + p.deductionsPaise)}`
                        : "—"}
                    </Td>
                    <Td>{p.bonusPaise > 0 ? rupee(p.bonusPaise) : "—"}</Td>
                    <td className="py-2 pl-2 text-right font-mono text-body font-semibold">
                      {rupee(p.netPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-caption normal-case text-content-muted">
          Worked out from attendance every time this opens — correct a day above
          and the pay corrects itself. Leave and holidays count as paid; mark a
          day absent to dock it.
        </p>
      </Card>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`py-2 text-caption uppercase text-content-muted ${right ? "px-2 text-right" : "pr-2"}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 px-2 text-right font-mono text-body">{children}</td>;
}

/** Add someone to the payroll. */
function NewStaffForm({
  orgId,
  onDone,
}: {
  orgId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [salary, setSalary] = useState("");
  const [daily, setDaily] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A staff member needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const phoneT = phone.trim();
      const roleT = role.trim();
      await saveStaff({
        id: crypto.randomUUID(),
        orgId,
        name: trimmed,
        salaryPaise: rupeesToPaise(Number(salary || "0")),
        isDailyWage: daily,
        ...(phoneT ? { phone: phoneT } : {}),
        ...(roleT ? { role: roleT } : {}),
      });
      requestSync();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name *" id="ns-name" value={name} onChange={setName} placeholder="Ramesh Kumar" />
        <Field label="Phone" id="ns-phone" value={phone} onChange={setPhone} placeholder="For the payslip" />
        <Field label="Role" id="ns-role" value={role} onChange={setRole} placeholder="Sales, helper, cashier" />
        <div className="flex flex-col gap-1">
          <Label htmlFor="ns-salary">
            {daily ? "Wage per day (₹)" : "Salary per month (₹)"}
          </Label>
          <Input
            id="ns-salary"
            inputMode="decimal"
            value={salary}
            onChange={(e) => setSalary(e.target.value.replace(/[^\d.]/g, ""))}
            className="text-right font-mono"
            placeholder="0.00"
          />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={daily}
          onChange={(e) => setDaily(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-body text-content-muted">
          Paid per day rather than per month
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <Button size="sm" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving…" : "Save staff"}
        </Button>
      </div>
    </div>
  );
}

/** Record an advance, loan, deduction or bonus. */
function NewAdvanceForm({
  orgId,
  userId,
  staff,
  month,
  onDone,
}: {
  orgId: string;
  userId: string;
  staff: StaffRow[];
  month: string;
  onDone: () => void | Promise<void>;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [kind, setKind] = useState<AdvanceKind>("advance");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const paise = rupeesToPaise(Number(amount || "0"));
    if (!staffId || paise <= 0) {
      setError("Pick a staff member and an amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const noteT = note.trim();
      await saveAdvance({
        id: crypto.randomUUID(),
        orgId,
        staffId,
        kind,
        amountPaise: paise,
        date: ymd(new Date()),
        settleMonth: month,
        createdBy: userId,
        ...(noteT ? { note: noteT } : {}),
      });
      setAmount("");
      setNote("");
      requestSync();
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const select =
    "min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="adv-staff">Staff</Label>
          <select
            id="adv-staff"
            className={select}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="adv-kind">Type</Label>
          <select
            id="adv-kind"
            className={select}
            value={kind}
            onChange={(e) => setKind(e.target.value as AdvanceKind)}
          >
            <option value="advance">Advance</option>
            <option value="loan">Loan</option>
            <option value="deduction">Deduction</option>
            <option value="bonus">Bonus</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="adv-amount">Amount (₹)</Label>
          <Input
            id="adv-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="text-right font-mono"
            placeholder="0.00"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="adv-note">Note</Label>
          <Input
            id="adv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What it was for"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <Button size="sm" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving…" : "Record"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
