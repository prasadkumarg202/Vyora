"use client";

import { useMemo, useState } from "react";

/**
 * Date range picker — built for how Indian shops actually think about time.
 *
 * Typing two dates is the slowest part of every report screen, so the common
 * answers are one tap: today, yesterday, this month, last month, this quarter,
 * this financial year. The financial year runs April–March here, not January–
 * December, which is the detail imported tools get wrong and every Indian
 * business notices immediately.
 *
 * "Custom" reveals the two date fields; everything else keeps them out of the
 * way. The chosen range is always spelled out in plain language underneath, so
 * nobody has to guess what "Q3" meant.
 */

export interface DateRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  label: string;
}

const ymd = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const shift = (d: Date, days: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
};

/** April-to-March. Returns the year the FY starts in. */
function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisFy"
  | "lastFy"
  | "custom";

/** Resolve a preset against a reference date (today, unless a test says otherwise). */
export function resolvePreset(key: PresetKey, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "today":
      return { from: ymd(now), to: ymd(now), label: "Today" };
    case "yesterday": {
      const d = shift(now, -1);
      return { from: ymd(d), to: ymd(d), label: "Yesterday" };
    }
    case "last7":
      return { from: ymd(shift(now, -6)), to: ymd(now), label: "Last 7 days" };
    case "thisMonth":
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(now),
        label: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      };
    case "lastMonth": {
      const start = new Date(y, m - 1, 1);
      return {
        from: ymd(start),
        to: ymd(new Date(y, m, 0)),
        label: start.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      };
    }
    case "thisQuarter": {
      // Quarters follow the financial year: Apr-Jun is Q1.
      const fy = fyStartYear(now);
      const qIndex = Math.floor(((m - 3 + 12) % 12) / 3);
      const start = new Date(fy, 3 + qIndex * 3, 1);
      const end = new Date(fy, 3 + qIndex * 3 + 3, 0);
      return { from: ymd(start), to: ymd(end), label: `Q${qIndex + 1} · FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}` };
    }
    case "thisFy": {
      const fy = fyStartYear(now);
      return {
        from: ymd(new Date(fy, 3, 1)),
        to: ymd(now),
        label: `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`,
      };
    }
    case "lastFy": {
      const fy = fyStartYear(now) - 1;
      return {
        from: ymd(new Date(fy, 3, 1)),
        to: ymd(new Date(fy + 1, 2, 31)),
        label: `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`,
      };
    }
    case "custom":
      return { from: ymd(new Date(y, m, 1)), to: ymd(now), label: "Custom range" };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "thisFy", label: "This FY" },
  { key: "lastFy", label: "Last FY" },
  { key: "custom", label: "Custom" },
];

/** Long-form so a printed or shared report is unambiguous. */
function pretty(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DateRangePicker({
  value,
  onChange,
  initialPreset = "thisMonth",
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  initialPreset?: PresetKey;
}) {
  const [active, setActive] = useState<PresetKey>(initialPreset);

  const summary = useMemo(
    () =>
      value.from === value.to
        ? pretty(value.from)
        : `${pretty(value.from)} → ${pretty(value.to)}`,
    [value.from, value.to],
  );

  function choose(key: PresetKey) {
    setActive(key);
    onChange(resolvePreset(key));
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => choose(p.key)}
            aria-pressed={active === p.key}
            className={
              "rounded-control border px-3 py-1.5 text-caption font-medium normal-case transition-colors " +
              (active === p.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-canvas text-content-muted hover:border-primary hover:text-primary")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {active === "custom" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium uppercase text-content-muted">From</span>
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) =>
                onChange({ ...value, from: e.target.value, label: "Custom range" })
              }
              className="min-h-touch rounded-input border border-border bg-canvas px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium uppercase text-content-muted">To</span>
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) =>
                onChange({ ...value, to: e.target.value, label: "Custom range" })
              }
              className="min-h-touch rounded-input border border-border bg-canvas px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            />
          </label>
        </div>
      ) : null}

      <p className="text-caption normal-case text-content-muted">
        Showing <span className="font-medium text-content">{summary}</span>
        {value.label && value.label !== "Custom range" ? ` · ${value.label}` : ""}
      </p>
    </div>
  );
}
