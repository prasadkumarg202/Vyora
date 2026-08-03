"use client";

import { formatPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DateRangePicker, resolvePreset, type DateRange } from "~/components/common/date-range";
import { listCustomers, type CustomerRow } from "~/lib/db/repository";
import { REPORTS, runReport, type ReportId, type ReportTable } from "~/lib/db/reports";
import { datedFilename, downloadCsv, toCsv } from "~/lib/import/csv";

/**
 * Reports — one engine, many reports.
 *
 * Competitors bury forty reports in a scrolling list and hand you a spreadsheet.
 * The bet here is different: pick from a searchable catalogue on the left, set
 * the period once with real presets (this month, this quarter, this FY), and
 * every report renders the same way — bordered, aligned, totalled, printable and
 * exportable. Numbers are right-aligned and monospaced so columns compare at a
 * glance; totals are always in view rather than at the bottom of 900 rows.
 *
 * Every figure is computed on-device, so reports work with no internet.
 */

export function ReportsHub({ orgId }: { orgId: string }) {
  const [reportId, setReportId] = useState<ReportId>("all-transactions");
  const [range, setRange] = useState<DateRange>(() => resolvePreset("thisMonth"));
  const [table, setTable] = useState<ReportTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [partyId, setPartyId] = useState("");

  const meta = REPORTS.find((r) => r.id === reportId)!;

  useEffect(() => {
    void listCustomers(orgId).then(setCustomers).catch(() => {});
  }, [orgId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setTable(
        await runReport(reportId, {
          orgId,
          from: range.from,
          to: range.to,
          partyId: partyId || undefined,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
      setTable(null);
    } finally {
      setBusy(false);
    }
  }, [reportId, orgId, range.from, range.to, partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Catalogue, grouped, filtered by the little search box. */
  const grouped = useMemo(() => {
    const q = catalogueQuery.trim().toLowerCase();
    const matches = REPORTS.filter(
      (r) =>
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.blurb.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q),
    );
    const map = new Map<string, typeof REPORTS>();
    for (const r of matches) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return [...map.entries()];
  }, [catalogueQuery]);

  /** Row-level search across every visible cell. */
  const rows = useMemo(() => {
    if (!table) return [];
    const q = search.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [table, search]);

  const cell = (value: string | number | null, money?: boolean): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (money && typeof value === "number") return formatPaise(value as Paise);
    return String(value);
  };

  function exportCsv() {
    if (!table) return;
    downloadCsv(
      datedFilename(reportId),
      toCsv(
        table.columns.map((c) => c.label),
        rows.map((r) =>
          table.columns.map((c) =>
            c.money && typeof r[c.key] === "number"
              ? ((r[c.key] as number) / 100).toFixed(2)
              : (r[c.key] ?? ""),
          ),
        ),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 print:hidden">
        <h1 className="text-h1">Reports</h1>
        <p className="text-body text-content-muted">
          Pick a report, set the period once, and take it away as a print-out or
          a spreadsheet. Everything is worked out on this device.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Catalogue */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72 print:hidden">
          <Input
            value={catalogueQuery}
            onChange={(e) => setCatalogueQuery(e.target.value)}
            placeholder="Find a report…"
            aria-label="Find a report"
          />
          <div className="flex flex-col gap-4">
            {grouped.map(([group, list]) => (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-caption font-semibold uppercase text-content-muted">{group}</span>
                {list.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setReportId(r.id);
                      setSearch("");
                    }}
                    className={
                      "rounded-control border px-3 py-2 text-left text-body transition-colors " +
                      (reportId === r.id
                        ? "border-primary bg-primary-tonal font-medium text-primary"
                        : "border-transparent text-content-muted hover:border-border hover:text-content")
                    }
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 ? (
              <p className="text-body text-content-muted">No report matches that.</p>
            ) : null}
          </div>
        </aside>

        {/* The report itself */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2">{meta.title}</h2>
            <p className="text-body text-content-muted">{meta.blurb}</p>
          </div>

          {!meta.ignoresDates ? (
            <div className="print:hidden">
              <DateRangePicker value={range} onChange={setRange} />
            </div>
          ) : null}

          {meta.needsParty ? (
            <div className="flex flex-col gap-1 sm:max-w-md print:hidden">
              <label htmlFor="rep-party" className="text-caption font-medium uppercase text-content-muted">
                Party
              </label>
              <select
                id="rep-party"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
              >
                <option value="">Choose a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search within this report…"
              aria-label="Search within this report"
              className="sm:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{rows.length} rows</Badge>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!table || rows.length === 0}>
                ⬇ CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!table}>
                🖨 Print
              </Button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
              {error}
            </p>
          ) : null}

          {busy ? (
            <p className="text-body text-content-muted">Working it out…</p>
          ) : !table || table.columns.length === 0 ? (
            <EmptyState title="Nothing to show" description={table?.note ?? "Choose a report to begin."} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No entries in this period"
              description="Try a wider period — the presets above jump to a month, quarter or financial year in one tap."
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-left text-body">
                <thead>
                  <tr className="bg-canvas">
                    {table.columns.map((c) => (
                      <th
                        key={c.key}
                        className={
                          "border-b border-border px-3 py-2 text-caption font-semibold uppercase text-content-muted " +
                          (c.align === "right" ? "text-right" : "")
                        }
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-canvas">
                      {table.columns.map((c) => (
                        <td
                          key={c.key}
                          className={
                            "border-b border-border px-3 py-2 " +
                            (c.align === "right" ? "text-right font-mono" : "")
                          }
                        >
                          {cell(r[c.key] ?? null, c.money)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {table.totals ? (
                  <tfoot>
                    <tr className="bg-canvas">
                      {table.columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={
                            "border-t-2 border-border px-3 py-3 font-semibold " +
                            (c.align === "right" ? "text-right font-mono" : "")
                          }
                        >
                          {i === 0
                            ? "Total"
                            : table.totals?.[c.key] !== undefined
                              ? cell(table.totals[c.key]!, c.money)
                              : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </Card>
          )}

          {table?.note ? (
            <p className="text-caption normal-case text-content-muted">{table.note}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
