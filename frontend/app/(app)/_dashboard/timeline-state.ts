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
  // "All" is first in the loop and always matches (filterSnapshots returns the full series).
  for (const p of (["All", "1Y", "YTD", "3M", "1M", "1W"] as Period[])) {
    if (filterSnapshots(series, p, latest).length >= 2) return p;
  }
  return "All"; // unreachable
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

export function deriveTimelineUi(
  chartState: ChartState,
  series: ChartSnapshotPoint[],
): DerivedTimelineUi {
  if (chartState === "anchor") {
    return {
      chartState,
      subtitle: "Each import or save adds a snapshot. The line chart appears after you have more than one.",
      cta: "banner",
      chartFootnote: null,
    };
  }

  if (chartState === "sparse") {
    const subtitle =
      series.length >= 2
        ? `By asset class · ${series.length} saved snapshots`
        : "By asset class · investable accounts only.";
    return {
      chartState,
      subtitle,
      cta: "subtle",
      chartFootnote:
        "Shaded area is space for future snapshots. Hover a point to see when it was saved and the breakdown by asset class.",
    };
  }

  // full
  return {
    chartState,
    subtitle: "By asset class · investable accounts only.",
    cta: "none",
    chartFootnote:
      "Net worth in the header also includes non-investable assets and liabilities.",
  };
}
