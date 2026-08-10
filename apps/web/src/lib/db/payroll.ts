"use client";

import { all, batch, get, run } from "./client";
import { ready } from "./repository";

/**
 * Staff, attendance and pay — the register a shop already keeps, in the database.
 *
 * Every read here is local SQLite, so a shopkeeper marks the morning's
 * attendance whether or not there is signal, and every write is dirty until the
 * sync engine flushes it. That is the same contract billing keeps, and it is the
 * only one that works at a counter.
 *
 * The one rule worth stating twice: **no monthly total is ever stored**. A
 * payslip is computed from attendance and advances at the moment it is opened.
 * Storing it would mean that correcting a wrongly-marked absence leaves last
 * month's slip quietly wrong, and the shopkeeper would have no way to tell which
 * of the two numbers was the real one.
 */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "half_day"
  | "leave"
  | "holiday";

export type AdvanceKind = "advance" | "loan" | "deduction" | "bonus";

export interface StaffRow {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  salary_paise: number;
  is_daily_wage: number;
  ot_rate_paise: number | null;
  joined_on: string | null;
  left_on: string | null;
  note: string | null;
  updated_at: string;
  version: number;
  dirty: number;
}

export interface AttendanceRow {
  id: string;
  staff_id: string;
  date: string;
  status: AttendanceStatus;
  ot_minutes: number;
}

export interface AdvanceRow {
  id: string;
  staff_id: string;
  kind: AdvanceKind;
  amount_paise: number;
  date: string;
  note: string | null;
  settle_month: string | null;
  dirty: number;
}

// --- Staff -------------------------------------------------------------------

export async function saveStaff(staff: {
  id: string;
  orgId: string;
  name: string;
  phone?: string | undefined;
  role?: string | undefined;
  salaryPaise: number;
  isDailyWage?: boolean | undefined;
  otRatePaise?: number | undefined;
  joinedOn?: string | undefined;
  note?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  // Upsert rather than insert: editing a wage is the commonest change to this
  // table, and a second row for the same person would double them on every
  // payslip from then on.
  await run(
    `INSERT INTO staff
       (id, name, phone, role, salary_paise, is_daily_wage, ot_rate_paise,
        joined_on, note, org_id, updated_at, version, dirty)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1)
     ON CONFLICT(id) DO UPDATE SET
       name          = excluded.name,
       phone         = excluded.phone,
       role          = excluded.role,
       salary_paise  = excluded.salary_paise,
       is_daily_wage = excluded.is_daily_wage,
       ot_rate_paise = excluded.ot_rate_paise,
       joined_on     = excluded.joined_on,
       note          = excluded.note,
       updated_at    = excluded.updated_at,
       -- Re-adding someone who was removed must bring them back. Without this,
       -- the tombstone survives the update and they stay invisible to every
       -- list while appearing to have saved successfully.
       deleted_at    = NULL,
       dirty         = 1`,
    [
      staff.id,
      staff.name,
      staff.phone ?? null,
      staff.role ?? null,
      Math.round(staff.salaryPaise),
      staff.isDailyWage ? 1 : 0,
      staff.otRatePaise === undefined ? null : Math.round(staff.otRatePaise),
      staff.joinedOn ?? null,
      staff.note ?? null,
      staff.orgId,
      now,
    ],
  );
}

/** Everyone still on the books. */
export function listStaff(orgId: string): Promise<StaffRow[]> {
  return ready().then(() =>
    all<StaffRow>(
      `SELECT id, name, phone, role, salary_paise, is_daily_wage, ot_rate_paise,
              joined_on, left_on, note, updated_at, version, dirty
         FROM staff
        WHERE org_id = ? AND deleted_at IS NULL AND left_on IS NULL
        ORDER BY name`,
      [orgId],
    ),
  );
}

/**
 * Everyone who was on the books at any point in a month, as YYYY-MM.
 *
 * Distinct from `listStaff`, and the distinction is the difference between
 * paying someone and not. Someone who left on the 12th is off the current staff
 * list the moment that is recorded — but the shop still owes them twelve days,
 * and building the payslip from the current list would make that wage vanish
 * from the screen at exactly the moment it needed paying.
 */
export function staffForMonth(
  orgId: string,
  month: string,
): Promise<StaffRow[]> {
  return ready().then(() =>
    all<StaffRow>(
      `SELECT id, name, phone, role, salary_paise, is_daily_wage, ot_rate_paise,
              joined_on, left_on, note, updated_at, version, dirty
         FROM staff
        WHERE org_id = ?
          AND deleted_at IS NULL
          AND (left_on IS NULL OR substr(left_on, 1, 7) >= ?)
          AND (joined_on IS NULL OR substr(joined_on, 1, 7) <= ?)
        ORDER BY name`,
      [orgId, month, month],
    ),
  );
}

/**
 * Mark someone as having left.
 *
 * Not a delete. Their attendance and last payslip must stay readable — a shop
 * asked about a wage paid eight months ago needs an answer, and "we removed
 * them" is not one.
 */
export async function markStaffLeft(args: {
  orgId: string;
  staffId: string;
  on: string;
}): Promise<void> {
  await ready();
  await run(
    `UPDATE staff SET left_on = ?, updated_at = ?, dirty = 1
      WHERE id = ? AND org_id = ?`,
    [args.on, new Date().toISOString(), args.staffId, args.orgId],
  );
}

// --- Attendance --------------------------------------------------------------

/**
 * Mark one person on one day.
 *
 * Upserts on the (staff_id, date) unique index, so pressing Present twice — or
 * two people marking the same morning from two devices — corrects the day
 * instead of creating a second one that silently doubles the wage.
 */
export async function markAttendance(args: {
  orgId: string;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  otMinutes?: number | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO staff_attendance
       (id, staff_id, date, status, ot_minutes, org_id, updated_at, version, dirty)
     VALUES (?,?,?,?,?,?,?,0,1)
     ON CONFLICT(staff_id, date) WHERE deleted_at IS NULL DO UPDATE SET
       status     = excluded.status,
       ot_minutes = excluded.ot_minutes,
       updated_at = excluded.updated_at,
       dirty      = 1`,
    [
      crypto.randomUUID(),
      args.staffId,
      args.date,
      args.status,
      Math.max(0, Math.round(args.otMinutes ?? 0)),
      args.orgId,
      now,
    ],
  );
}

/** Every mark in a month, as YYYY-MM. */
export function attendanceForMonth(
  orgId: string,
  month: string,
): Promise<AttendanceRow[]> {
  return ready().then(() =>
    all<AttendanceRow>(
      `SELECT id, staff_id, date, status, ot_minutes
         FROM staff_attendance
        WHERE org_id = ? AND deleted_at IS NULL AND date LIKE ?
        ORDER BY date`,
      [orgId, `${month}-%`],
    ),
  );
}

// --- Advances, loans, deductions and bonuses ---------------------------------

export async function saveAdvance(args: {
  id: string;
  orgId: string;
  staffId: string;
  kind: AdvanceKind;
  amountPaise: number;
  date: string;
  note?: string | undefined;
  settleMonth?: string | undefined;
  createdBy?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO staff_advances
              (id, staff_id, kind, amount_paise, date, note, settle_month,
               created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        args.id,
        args.staffId,
        args.kind,
        // Always positive; `kind` decides the direction. A signed amount plus a
        // kind gives two ways to say the same thing, and they drift.
        Math.abs(Math.round(args.amountPaise)),
        args.date,
        args.note ?? null,
        args.settleMonth ?? null,
        args.createdBy ?? null,
        args.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/**
 * What settles against a given salary month.
 *
 * An entry counts for the month it was explicitly assigned to, or — when it was
 * not assigned one — the month it was taken in. That second case is the common
 * one: a shopkeeper handing over ₹2,000 mid-month is not thinking about which
 * payslip it lands on, and the software should not make them.
 */
export function advancesForMonth(
  orgId: string,
  month: string,
): Promise<AdvanceRow[]> {
  return ready().then(() =>
    all<AdvanceRow>(
      `SELECT id, staff_id, kind, amount_paise, date, note, settle_month, dirty
         FROM staff_advances
        WHERE org_id = ?
          AND deleted_at IS NULL
          AND COALESCE(settle_month, substr(date, 1, 7)) = ?
        ORDER BY date`,
      [orgId, month],
    ),
  );
}

export async function deleteAdvance(args: {
  orgId: string;
  advanceId: string;
}): Promise<void> {
  await ready();
  // Tombstone, not a DELETE — a row removed outright could not beat a
  // concurrent remote edit, and could never tell the other device it went.
  await run(
    `UPDATE staff_advances SET deleted_at = ?, updated_at = ?, dirty = 1
      WHERE id = ? AND org_id = ?`,
    [new Date().toISOString(), new Date().toISOString(), args.advanceId, args.orgId],
  );
}

// --- The payslip -------------------------------------------------------------

export interface PayslipLine {
  staffId: string;
  name: string;
  role: string | null;
  /** Days the shop counts as worked — a half-day counts as 0.5. */
  daysWorked: number;
  daysAbsent: number;
  daysOnLeave: number;
  otMinutes: number;
  /** Full monthly wage before anything is taken off. */
  grossPaise: number;
  /** Earned after attendance — gross for a full month, less for a short one. */
  earnedPaise: number;
  otPaise: number;
  advancesPaise: number;
  deductionsPaise: number;
  bonusPaise: number;
  /** What actually goes in the envelope. Never below zero. */
  netPaise: number;
}

/** Days in a YYYY-MM month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** A day's attendance, as a fraction of a day worked. */
function dayWeight(status: AttendanceStatus): number {
  if (status === "present") return 1;
  if (status === "half_day") return 0.5;
  // Leave and holiday are paid days off; absent is not. Treating leave as
  // unpaid would be a policy decision this software has no business making
  // silently, and shops that do dock leave can simply mark it absent.
  if (status === "leave" || status === "holiday") return 1;
  return 0;
}

/**
 * Build the month's payslips.
 *
 * Every figure is derived here and nothing is written back, so re-running it
 * after fixing a wrongly-marked day produces the corrected slip rather than
 * disagreeing with a stored one.
 *
 * Rounding happens once, at the end of each line, and always to whole paise.
 * Rounding a daily rate first and multiplying by 26 would drift by up to a
 * quarter of a rupee a month — small, and exactly the kind of small that a
 * shopkeeper notices and stops trusting the app over.
 */
export async function payslipsForMonth(
  orgId: string,
  month: string,
): Promise<PayslipLine[]> {
  const [staff, attendance, advances] = await Promise.all([
    // Everyone who was on the books that month, not everyone still here — see
    // staffForMonth. A leaver's final wage has to stay on the screen.
    staffForMonth(orgId, month),
    attendanceForMonth(orgId, month),
    advancesForMonth(orgId, month),
  ]);

  const total = daysInMonth(month);

  return staff.map((s) => {
    const mine = attendance.filter((a) => a.staff_id === s.id);

    let daysWorked = 0;
    let daysAbsent = 0;
    let daysOnLeave = 0;
    let otMinutes = 0;
    for (const a of mine) {
      daysWorked += dayWeight(a.status);
      if (a.status === "absent") daysAbsent += 1;
      if (a.status === "leave") daysOnLeave += 1;
      otMinutes += a.ot_minutes;
    }

    const gross = s.salary_paise;
    // A daily-wage worker is paid for what they did; a monthly one has their
    // wage pro-rated across the month's days. An unmarked month pays nothing
    // rather than a full wage — silence is not evidence of attendance.
    const earned = s.is_daily_wage === 1
      ? Math.round(gross * daysWorked)
      : Math.round((gross * daysWorked) / total);

    const otPaise =
      s.ot_rate_paise === null
        ? 0
        : Math.round((s.ot_rate_paise * otMinutes) / 60);

    const mineAdv = advances.filter((a) => a.staff_id === s.id);
    const sum = (kind: AdvanceKind) =>
      mineAdv
        .filter((a) => a.kind === kind)
        .reduce((n, a) => n + a.amount_paise, 0);

    const advancesPaise = sum("advance") + sum("loan");
    const deductionsPaise = sum("deduction");
    const bonusPaise = sum("bonus");

    const net =
      earned + otPaise + bonusPaise - advancesPaise - deductionsPaise;

    return {
      staffId: s.id,
      name: s.name,
      role: s.role,
      daysWorked,
      daysAbsent,
      daysOnLeave,
      otMinutes,
      grossPaise: gross,
      earnedPaise: earned,
      otPaise,
      advancesPaise,
      deductionsPaise,
      bonusPaise,
      // Clamped at zero. Someone who has drawn more than they earned owes the
      // shop money, and that is a balance to carry — not a negative payslip
      // that reads as though the shop is billing its own staff.
      netPaise: Math.max(0, net),
    };
  });
}

/** One staff member's outstanding loan balance, across all months. */
export async function loanBalance(
  orgId: string,
  staffId: string,
): Promise<number> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'loan' THEN amount_paise ELSE 0 END), 0) AS n
       FROM staff_advances
      WHERE org_id = ? AND staff_id = ? AND deleted_at IS NULL`,
    [orgId, staffId],
  );
  return row?.n ?? 0;
}
