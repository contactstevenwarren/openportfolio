/**
 * Mock time series for the dashboard net-worth timeline (v0.1 illustrative only).
 * Stack keys are legacy layer ids for the chart, not API AssetClass values.
 */

export type TimelineStackKey =
  | "cash"
  | "us-equity"
  | "intl-equity"
  | "fixed-income"
  | "real-estate";

export type SnapshotPoint = {
  date: string;
} & Record<TimelineStackKey, number>;

/** Layer colors: CSS vars in globals.css (--nw-timeline-*). */
export const TIMELINE_STACK_COLORS: Record<TimelineStackKey, string> = {
  cash: "var(--nw-timeline-cash)",
  "us-equity": "var(--nw-timeline-us-equity)",
  "intl-equity": "var(--nw-timeline-intl-equity)",
  "fixed-income": "var(--nw-timeline-fixed-income)",
  "real-estate": "var(--nw-timeline-real-estate)",
};

const monthlyDates = [
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-04-26",
];

const baseSnapshot: Record<TimelineStackKey, number> = {
  cash: 58000,
  "us-equity": 332000,
  "intl-equity": 96000,
  "fixed-income": 134000,
  "real-estate": 100000,
};

export const mockSnapshots: SnapshotPoint[] = monthlyDates.map((date, i) => {
  const growth = 1 + i * 0.012;
  const noise = 1 + Math.sin(i) * 0.02;
  return {
    date,
    cash: Math.round(baseSnapshot.cash * (1 + i * 0.008)),
    "us-equity": Math.round(baseSnapshot["us-equity"] * growth * noise),
    "intl-equity": Math.round(baseSnapshot["intl-equity"] * growth),
    "fixed-income": Math.round(baseSnapshot["fixed-income"] * (1 + i * 0.005)),
    "real-estate": Math.round(baseSnapshot["real-estate"] * (1 + i * 0.006)),
  };
});
