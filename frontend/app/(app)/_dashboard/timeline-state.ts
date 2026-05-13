/**
 * Investable timeline chart UI state (Phase A: mock + preview override).
 */

import {
  mockTimelineAnchor,
  mockTimelineFull,
  mockTimelineSparse,
  type SnapshotPoint,
  type TimelineStackKey,
} from "./timeline-mocks";

export type ChartState = "anchor" | "sparse" | "full";

export type Period = "1W" | "1M" | "3M" | "YTD" | "1Y" | "All";

export const PERIODS: Period[] = ["1W", "1M", "3M", "YTD", "1Y", "All"];

const RANGE_DISABLED_TITLE = "Available once history accumulates.";

export function snapshotTotal(p: SnapshotPoint): number {
  return (
    p.cash +
    p["us-equity"] +
    p["intl-equity"] +
    p["fixed-income"] +
    p["real-estate"]
  );
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
  snapshots: SnapshotPoint[],
  period: Period,
  latestOverride?: Date,
): SnapshotPoint[] {
  if (snapshots.length === 0) return snapshots;
  const latest = latestOverride ?? new Date(snapshots[snapshots.length - 1].date);
  const cutoff = periodCutoff(latest, period);
  if (!cutoff) return snapshots;
  const filtered = snapshots.filter((s) => new Date(s.date) >= cutoff);
  return filtered.length >= 2 ? filtered : snapshots.slice(-2);
}

/** Widest period (prefer showing full series) that still leaves ≥2 points after filter. */
export function defaultPeriodForSeries(series: SnapshotPoint[]): Period {
  if (series.length < 2) return "All";
  const latest = new Date(series[series.length - 1].date);
  const order: Period[] = ["All", "1Y", "YTD", "3M", "1M", "1W"];
  for (const p of order) {
    const f = filterSnapshots(series, p, latest);
    if (f.length >= 2) return p;
  }
  return "All";
}

/** Prefer 3M when it keeps every point (matches sparse “partial quarter” default). */
export function defaultPeriodForSparseSeries(series: SnapshotPoint[]): Period {
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
  series: SnapshotPoint[],
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
  showPerformancePill: boolean;
  performanceSinceCaption: string | null;
  cta: TimelineCta;
  /** Footnote under chart area for sparse (linear interpolation). */
  chartFootnote: string | null;
};

export function formatSinceMonthYear(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(isoDate));
}

/** e.g. Feb 26 — for sparse performance pill line. */
export function formatSinceMonthDay(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(isoDate));
}

export function deriveTimelineUi(
  chartState: ChartState,
  series: SnapshotPoint[],
  filteredSeries: SnapshotPoint[],
): DerivedTimelineUi {
  const oldest = filteredSeries[0]?.date ?? series[0]?.date ?? null;
  const sinceCaption =
    oldest != null
      ? `since ${
          chartState === "sparse" ? formatSinceMonthDay(oldest) : formatSinceMonthYear(oldest)
        }`
      : null;

  if (chartState === "anchor") {
    return {
      chartState,
      subtitle: "Historical performance tracks from your import date",
      showPerformancePill: false,
      performanceSinceCaption: null,
      cta: "banner",
      chartFootnote: null,
    };
  }

  if (chartState === "sparse") {
    const statements = Math.max(0, series.length - 1);
    const subtitle =
      series.length >= 2
        ? `Stacked by asset class · ${statements} statement${statements === 1 ? "" : "s"} + today`
        : "Stacked by asset class · investable accounts only.";
    return {
      chartState,
      subtitle,
      showPerformancePill: filteredSeries.length >= 2,
      performanceSinceCaption: sinceCaption,
      cta: "subtle",
      chartFootnote: null,
    };
  }

  // full
  return {
    chartState,
    subtitle: "Stacked by asset class · investable accounts only. Net worth in the header includes non-investable assets and liabilities.",
    showPerformancePill: filteredSeries.length >= 2,
    performanceSinceCaption: sinceCaption,
    cta: "none",
    chartFootnote: null,
  };
}

export const STACK_ORDER: Array<{ key: TimelineStackKey; label: string }> = [
  { key: "us-equity", label: "US equity" },
  { key: "fixed-income", label: "Fixed income" },
  { key: "intl-equity", label: "Intl equity" },
  { key: "real-estate", label: "Real estate" },
  { key: "cash", label: "Cash" },
];

export function getTimelineMockSeries(chartState: ChartState): SnapshotPoint[] {
  switch (chartState) {
    case "anchor":
      return mockTimelineAnchor;
    case "sparse":
      return mockTimelineSparse;
    case "full":
      return mockTimelineFull;
  }
}
