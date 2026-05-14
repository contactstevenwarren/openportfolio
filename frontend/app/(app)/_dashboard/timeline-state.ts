/**
 * Investable timeline chart UI state (snapshots + live allocation anchor).
 */

import type { RealSnapshotPoint } from "./snapshot-series";
import { realSnapshotTotal } from "./snapshot-series";

/** Rows plotted by the investable timeline (API snapshots or allocation-derived anchor). */
export type ChartSnapshotPoint = RealSnapshotPoint;

export type ChartState = "anchor" | "sparse" | "full";

export type Period = "1W" | "1M" | "3M" | "YTD" | "1Y" | "All";

export const PERIODS: Period[] = ["1W", "1M", "3M", "YTD", "1Y", "All"];

const RANGE_DISABLED_TITLE = "Available once history accumulates.";

export function snapshotTotal(p: ChartSnapshotPoint): number {
  return realSnapshotTotal(p);
}

/** Parse chart `date` ISO to ms (date-only treated as UTC noon). */
function chartDateInstantMs(isoDate: string): number {
  const raw = isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00Z`;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : NaN;
}

/** Whole UTC calendar days between instants (non-negative). */
export function utcCalendarDaySpan(aMs: number, bMs: number): number {
  const a = new Date(aMs);
  const b = new Date(bMs);
  const dayA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dayB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((dayB - dayA) / 86_400_000));
}

/**
 * Show a muted “change vs first day in range” line only when the window is at least one UTC calendar day
 * (avoids implying a trend from same-day-only points).
 */
export function performanceSummaryWarranted(
  chartState: ChartState,
  filteredSeries: ChartSnapshotPoint[],
): boolean {
  if (chartState === "anchor") return false;
  if (filteredSeries.length < 2) return false;
  const t0 = chartDateInstantMs(filteredSeries[0]!.date);
  const t1 = chartDateInstantMs(filteredSeries[filteredSeries.length - 1]!.date);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
  return utcCalendarDaySpan(t0, t1) >= 1;
}

export function formatPerformanceSince(chartState: ChartState, isoDate: string): string {
  const d = new Date(isoDate);
  if (chartState === "sparse") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

export type DeriveTimelineOpts = {
  /** Count of rows from GET /api/snapshots/ before UTC-day rollup (for honest copy). */
  rawSnapshotCount?: number;
};

export function periodCutoff(latest: Date, period: Period): Date | null {
  if (period === "All") return null;
  const d = new Date(latest);
  switch (period) {
    case "1W":
      d.setDate(d.getDate() - 7);
      return d;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "YTD":
      return new Date(latest.getFullYear(), 0, 1);
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
  }
}

export function filterSnapshots(
  snapshots: ChartSnapshotPoint[],
  period: Period,
  latestOverride?: Date,
): ChartSnapshotPoint[] {
  if (snapshots.length === 0) return snapshots;
  const latest = latestOverride ?? new Date(snapshots[snapshots.length - 1].date);
  const cutoff = periodCutoff(latest, period);
  if (!cutoff) return snapshots;
  const filtered = snapshots.filter((s) => new Date(s.date) >= cutoff);
  return filtered.length >= 2 ? filtered : snapshots.slice(-2);
}

/** Widest period (prefer showing full series) that still leaves ≥2 points after filter. */
export function defaultPeriodForSeries(series: ChartSnapshotPoint[]): Period {
  if (series.length < 2) return "All";
  const latest = new Date(series[series.length - 1].date);
  for (const p of ["All", "1Y", "YTD", "3M", "1M", "1W"] as Period[]) {
    if (filterSnapshots(series, p, latest).length >= 2) return p;
  }
  return "All";
}

/** Prefer 3M when it keeps every point (matches sparse “partial quarter” default). */
export function defaultPeriodForSparseSeries(series: ChartSnapshotPoint[]): Period {
  if (series.length < 2) return "All";
  const latest = new Date(series[series.length - 1].date);
  const with3m = filterSnapshots(series, "3M", latest);
  if (with3m.length === series.length) return "3M";
  return defaultPeriodForSeries(series);
}

export type PeriodControl = {
  period: Period;
  disabled: boolean;
  title?: string;
};

export function periodControls(
  chartState: ChartState,
  series: ChartSnapshotPoint[],
  latest: Date,
): PeriodControl[] {
  if (chartState === "anchor") {
    return PERIODS.map((period) => ({
      period,
      disabled: true,
      title: RANGE_DISABLED_TITLE,
    }));
  }

  return PERIODS.map((period) => {
    if (period === "All") {
      return { period, disabled: false };
    }
    const filtered = filterSnapshots(series, period, latest);
    const ok = filtered.length >= 2;
    return {
      period,
      disabled: !ok,
      title: !ok ? "Not enough history for this range." : undefined,
    };
  });
}

export type TimelineCta = "none" | "subtle" | "banner";

export type DerivedTimelineUi = {
  chartState: ChartState;
  subtitle: string;
  cta: TimelineCta;
  /** Footnote under chart area for sparse (linear interpolation). */
  chartFootnote: string | null;
};

function anchorRollupFootnote(raw: number | undefined, dayPoints: number): string | null {
  if (raw == null || raw < 2 || dayPoints < 1) return null;
  if (raw <= dayPoints) return null;
  return `${raw} saves in your history roll up to ${dayPoints} chart day${dayPoints === 1 ? "" : "s"} — one point per UTC calendar day (latest save that day).`;
}

export function deriveTimelineUi(
  chartState: ChartState,
  series: ChartSnapshotPoint[],
  opts?: DeriveTimelineOpts,
): DerivedTimelineUi {
  const raw = opts?.rawSnapshotCount;
  const rollupHint =
    "Each point is the latest save on that UTC calendar day.";

  if (chartState === "anchor") {
    const foot = anchorRollupFootnote(raw, series.length);
    return {
      chartState,
      subtitle:
        "One point per UTC calendar day (latest save that day). The stacked chart appears after you have more than one day of history.",
      cta: "banner",
      chartFootnote: foot,
    };
  }

  if (chartState === "sparse") {
    const n = series.length;
    const subtitle =
      n >= 2
        ? `By asset class · ${n} days on the chart (UTC · last save per day)`
        : "By asset class · investable accounts only.";
    return {
      chartState,
      subtitle,
      cta: "subtle",
      chartFootnote: `${rollupHint} Shaded area is space for future snapshots. Hover a point for save time and breakdown by class.`,
    };
  }

  return {
    chartState,
    subtitle: "By asset class · investable accounts only.",
    cta: "none",
    chartFootnote: `${rollupHint} Net worth in the header also includes non-investable assets and liabilities.`,
  };
}
