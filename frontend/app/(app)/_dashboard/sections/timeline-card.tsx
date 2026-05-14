"use client";

import * as React from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import useSWR from "swr";
import { Area, AreaChart, CartesianGrid, ReferenceArea, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import type { ScatterShapeProps } from "recharts";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/app/components/ui/chart";
import { api } from "@/app/lib/api";
import { formatPct } from "@/app/lib/format";
import { Provenance } from "@/app/lib/provenance";
import { cn } from "@/app/lib/utils";

import { formatUsd } from "../mocks";
import {
  REAL_STACK_ORDER,
  SPARSE_DOT_STACK_KEY_REAL,
  allocationToAnchorSeries,
  chartColorVarSegment,
  snapshotsToSeries,
  stackColor,
} from "../snapshot-series";
import {
  defaultPeriodForSeries,
  defaultPeriodForSparseSeries,
  deriveTimelineUi,
  filterSnapshots,
  formatPerformanceSince,
  performanceSummaryWarranted,
  periodControls,
  snapshotTotal,
  type ChartSnapshotPoint,
  type ChartState,
  type Period,
} from "../timeline-state";

const anchorChartConfig: ChartConfig = {
  portfolio: { label: "Investable total", color: "var(--success)" },
};

const realAreaChartConfig: ChartConfig = Object.fromEntries([
  ["portfolio", { label: "Investable total", color: "var(--success)" }],
  ...REAL_STACK_ORDER.map((s) => [s.key, { label: s.label, color: stackColor(s.key) }] as const),
]) satisfies ChartConfig;

const tickFormatterX = (value: string) => {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

const tickFormatterY = (v: number) => formatUsd(v, { compact: true });

const parseChartDate = Date.parse;

function utcDayEqual(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Full provenance line for `title=` tooltips on numbers (kept concise in UI body copy). */
const SNAPSHOTS_PROVENANCE_FOOTNOTE =
  "Each point reflects the investable total when that snapshot was saved. Hover a point to see the exact capture time and breakdown by asset class.";


type AnchorScatterPoint = { x: string; y: number };

function anchorYAxisMax(totalUsd: number): number {
  if (totalUsd <= 0) return 10_000;
  const padded = totalUsd * 1.18;
  if (padded <= 25_000) return Math.max(10_000, Math.ceil(padded / 2_500) * 2_500);
  if (padded <= 100_000) return Math.ceil(padded / 10_000) * 10_000;
  if (padded <= 500_000) return Math.ceil(padded / 25_000) * 25_000;
  const step = 100_000;
  return Math.max(200_000, Math.ceil(padded / step) * step);
}

function AnchorDotShape(props: { cx?: number; cy?: number; payload?: AnchorScatterPoint }) {
  const { cx = 0, cy = 0, payload } = props;
  const y = payload?.y ?? 0;
  return (
    <g>
      <text
        x={cx}
        y={cy - 14}
        textAnchor="middle"
        className="fill-foreground text-xs font-medium font-mono tabular-nums"
      >
        {formatUsd(y, { compact: true })}
      </text>
      <circle cx={cx} cy={cy} r={8} fill="var(--success)" stroke="var(--background)" strokeWidth={2} />
    </g>
  );
}

function AnchorTodayChart({
  totalUsd,
  xLabel,
  provenanceSource,
  provenanceFootnote,
  capturedAt,
  showBuildingHint,
}: {
  totalUsd: number;
  xLabel: string;
  provenanceSource: string;
  provenanceFootnote?: string;
  capturedAt?: string | null;
  showBuildingHint: boolean;
}) {
  const yMax = React.useMemo(() => anchorYAxisMax(totalUsd), [totalUsd]);
  const data = React.useMemo(
    (): AnchorScatterPoint[] => [{ x: xLabel, y: totalUsd }],
    [totalUsd, xLabel],
  );

  return (
    <div className="w-full">
      <div className="relative h-36 w-full sm:h-40">
        <ChartContainer config={anchorChartConfig} className="h-full min-h-0 w-full aspect-auto">
          <ScatterChart margin={{ top: 24, right: 16, bottom: 2, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              type="category"
              dataKey="x"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, yMax]}
              tickCount={5}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={tickFormatterY}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border border-border/50 bg-background px-2 py-1 text-xs shadow-md">
                    <Provenance
                      source={provenanceSource}
                      footnote={provenanceFootnote}
                      capturedAt={capturedAt ?? undefined}
                    >
                      <span className="font-mono font-medium tabular-nums">
                        {formatUsd((payload[0].payload as AnchorScatterPoint).y, { compact: true })}
                      </span>
                    </Provenance>
                  </div>
                ) : null
              }
            />
            <Scatter
              data={data}
              fill="transparent"
              isAnimationActive={false}
              shape={(props: ScatterShapeProps) => (
                <AnchorDotShape
                  cx={props.cx}
                  cy={props.cy}
                  payload={props.payload as AnchorScatterPoint | undefined}
                />
              )}
            />
          </ScatterChart>
        </ChartContainer>
      </div>
      {showBuildingHint ? (
        <p className="mt-2 text-center text-body-sm text-muted-foreground">
          Each import adds a snapshot. Import on a second day to start building the line chart.
        </p>
      ) : null}
    </div>
  );
}

function chartStateFromSnapshotCount(n: number): ChartState {
  if (n <= 1) return "anchor";
  if (n === 2) return "sparse";
  return "full";
}

export function TimelineCard() {
  const {
    data: snapshotList,
    error: snapshotsError,
    isLoading: snapshotsLoading,
  } = useSWR("/api/snapshots", () => api.snapshots());
  const {
    data: allocation,
    error: allocationError,
    isLoading: allocationLoading,
  } = useSWR("/api/allocation", () => api.allocation());

  const persistedSeries = React.useMemo(() => {
    if (snapshotsError || !snapshotList) return [];
    return snapshotsToSeries(snapshotList);
  }, [snapshotList, snapshotsError]);

  const hasRealSnapshots = persistedSeries.length > 0;
  const chartState = chartStateFromSnapshotCount(persistedSeries.length);

  const series = React.useMemo((): ChartSnapshotPoint[] => {
    if (hasRealSnapshots) return persistedSeries;
    if (allocation) return allocationToAnchorSeries(allocation);
    return [];
  }, [hasRealSnapshots, persistedSeries, allocation]);

  const [period, setPeriod] = React.useState<Period>("All");

  React.useEffect(() => {
    if (series.length === 0) return;
    setPeriod(
      chartState === "sparse"
        ? defaultPeriodForSparseSeries(series)
        : defaultPeriodForSeries(series),
    );
  }, [chartState, series]);

  const latest = React.useMemo(
    () => new Date(series[series.length - 1]?.date ?? Date.now()),
    [series],
  );

  const filtered = React.useMemo(
    () => filterSnapshots(series, period, latest),
    [series, period, latest],
  );

  const periodMeta = React.useMemo(
    () => periodControls(chartState, series, latest),
    [chartState, series, latest],
  );

  const derived = React.useMemo(
    () => deriveTimelineUi(chartState, series),
    [chartState, series],
  );

  const anchorTotal = series[0] ? snapshotTotal(series[0]) : 0;

  const isSparseChart = chartState === "sparse";

  const stackedChartData = React.useMemo(() => {
    if (!isSparseChart) return filtered;
    return filtered.map((p) => ({ ...p, t: parseChartDate(p.date) }));
  }, [isSparseChart, filtered]);

  const sparseXLayout = React.useMemo(():
    | { domain: [number, number]; lastT: number }
    | null => {
    if (!isSparseChart || filtered.length < 1) return null;
    const ts = filtered.map((p) => parseChartDate(p.date));
    const tMin = ts[0]!;
    const tMax = ts[ts.length - 1]!;
    // Avoid forcing a full-day minimum when two snapshots land minutes apart (same import session);
    // otherwise both points stack on the left and the chart looks "broken".
    const span = tMax - tMin;
    const runway = Math.max(Math.round(span * 0.55), 3_600_000);
    return {
      domain: [tMin, tMax + runway] as [number, number],
      lastT: tMax,
    };
  }, [isSparseChart, filtered]);

  const formatSparseXTickNumber = React.useCallback(
    (ts: number) => {
      if (sparseXLayout && ts === sparseXLayout.lastT && utcDayEqual(ts, Date.now())) return "Today";
      return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    },
    [sparseXLayout],
  );

  const snapsResolved = !snapshotsLoading || snapshotsError != null;
  const allocResolved = !allocationLoading || allocationError != null;
  const chartReady =
    snapsResolved && (hasRealSnapshots || (allocResolved && allocation != null));

  const anchorXLabel = React.useMemo(() => {
    if (hasRealSnapshots && persistedSeries.length === 1 && snapshotList?.[0]) {
      const s0 = snapshotList[0];
      const raw = s0.taken_at.includes("T") ? s0.taken_at : `${s0.taken_at}T12:00:00Z`;
      return new Date(raw).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return "Today";
  }, [hasRealSnapshots, persistedSeries.length, snapshotList]);

  const anchorCapturedAt =
    hasRealSnapshots && snapshotList?.[0] ? snapshotList[0].taken_at : null;

  const firstFiltered = filtered[0];
  const lastFiltered = filtered[filtered.length - 1];
  const showPerformanceSummary =
    chartReady &&
    performanceSummaryWarranted(chartState, filtered) &&
    firstFiltered &&
    lastFiltered;
  const firstTotal = firstFiltered ? snapshotTotal(firstFiltered) : 0;
  const lastTotal = lastFiltered ? snapshotTotal(lastFiltered) : 0;
  const deltaUsd = lastTotal - firstTotal;
  const deltaPct = firstTotal === 0 ? 0 : deltaUsd / firstTotal;
  const positive = deltaUsd >= 0;
  const sentimentSummary = positive ? "text-success" : "text-destructive";
  const trendGlyph = positive ? "\u2197" : "\u2198";
  const sinceLabel =
    showPerformanceSummary && firstFiltered
      ? formatPerformanceSince(chartState, firstFiltered.date)
      : null;

  const periodButtons = periodMeta.map(({ period: p, disabled, title }) => {
    const active = chartState !== "anchor" && p === period;
    return (
      <button
        key={p}
        type="button"
        aria-pressed={active}
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setPeriod(p)}
        className={cn(
          "rounded-sm px-2 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "cursor-not-allowed opacity-40",
          active && !disabled && "bg-foreground text-background",
          !active && !disabled && "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {p}
      </button>
    );
  });

  const performanceBadge = showPerformanceSummary ? (
    <p className="text-body-sm leading-snug">
      <span className={cn("font-mono font-medium tabular-nums", sentimentSummary)}>
        <Provenance
          source="snapshots"
          footnote={SNAPSHOTS_PROVENANCE_FOOTNOTE}
          capturedAt={lastFiltered?.snapshotTakenAt ?? undefined}
        >
          {formatUsd(deltaUsd, { signed: true })} · {formatPct(deltaPct, { signed: true, digits: 2 })}
        </Provenance>{" "}
        <span className="font-sans font-normal" aria-hidden>
          {trendGlyph}
        </span>
      </span>
      {sinceLabel ? (
        <span className="font-sans font-normal text-muted-foreground">
          {" "}
          · since {sinceLabel}
        </span>
      ) : null}
    </p>
  ) : null;

  return (
    <Card className="h-full">
      <CardHeader className="px-6">
        {chartState === "full" ? (
          // full state: one row — title, period controls, performance badge
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CardTitle className="text-h3 min-w-0 flex-1">
              Investable portfolio over time
            </CardTitle>
            <div
              role="group"
              aria-label="Time period"
              className="flex flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5"
            >
              {periodButtons}
            </div>
            {showPerformanceSummary ? (
              <div className="shrink-0 text-right">{performanceBadge}</div>
            ) : null}
          </div>
        ) : (
          // anchor / sparse states: title, subtitle hint, period controls
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-h3 min-w-0 flex-1 pr-2">
                Investable portfolio over time
              </CardTitle>
              {showPerformanceSummary ? (
                <div className="max-w-[min(100%,22rem)] shrink-0 text-right">{performanceBadge}</div>
              ) : null}
            </div>
            <CardDescription className="text-pretty">{derived.subtitle}</CardDescription>
            <div
              role="group"
              aria-label="Time period"
              className="flex w-full max-w-md flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5"
            >
              {periodButtons}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!chartReady ? (
          <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-8 text-body-sm text-muted-foreground">
            {snapshotsError || allocationError
              ? "Couldn't load this chart. Check your connection and try again."
              : "Loading timeline…"}
          </div>
        ) : chartState === "anchor" ? (
          <AnchorTodayChart
            totalUsd={anchorTotal}
            xLabel={anchorXLabel}
            provenanceSource={hasRealSnapshots ? "snapshots" : "allocation"}
            provenanceFootnote={
              hasRealSnapshots ? SNAPSHOTS_PROVENANCE_FOOTNOTE : "Live investable total from /api/allocation."
            }
            capturedAt={anchorCapturedAt}
            showBuildingHint={!hasRealSnapshots}
          />
        ) : (
          <ChartContainer config={realAreaChartConfig} className="aspect-[16/6] w-full">
            <AreaChart data={stackedChartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                {REAL_STACK_ORDER.map((s) => {
                  const seg = chartColorVarSegment(s.key);
                  return (
                    <linearGradient key={s.key} id={`fill-${seg}`} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={`var(--color-${seg})`}
                        stopOpacity={0.6}
                      />
                      <stop
                        offset="100%"
                        stopColor={`var(--color-${seg})`}
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                horizontal
                vertical={isSparseChart}
                strokeOpacity={isSparseChart ? 0.45 : 1}
              />
              {isSparseChart && sparseXLayout ? (
                <XAxis
                  type="number"
                  dataKey="t"
                  scale="time"
                  domain={sparseXLayout.domain}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={8}
                  tickFormatter={formatSparseXTickNumber}
                />
              ) : (
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={tickFormatterX}
                />
              )}
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={56}
                tickFormatter={tickFormatterY}
              />
              {sparseXLayout ? (
                <ReferenceArea
                  x1={sparseXLayout.lastT}
                  x2={sparseXLayout.domain[1]}
                  fill="var(--muted)"
                  fillOpacity={0.14}
                  strokeOpacity={0}
                  ifOverflow="visible"
                  aria-hidden
                />
              ) : null}
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                content={<TimelineTooltip />}
              />
              {REAL_STACK_ORDER.map((s) => {
                const seg = chartColorVarSegment(s.key);
                return (
                  <Area
                    key={s.key}
                    type={isSparseChart ? "linear" : "monotone"}
                    dataKey={s.key}
                    stackId="nw"
                    stroke={`var(--color-${seg})`}
                    fill={`url(#fill-${seg})`}
                    strokeWidth={isSparseChart ? 1.25 : 1.5}
                    isAnimationActive={false}
                    dot={
                      isSparseChart && s.key === SPARSE_DOT_STACK_KEY_REAL
                        ? {
                            r: 4,
                            fill: stackColor(SPARSE_DOT_STACK_KEY_REAL),
                            stroke: "var(--background)",
                            strokeWidth: 1,
                          }
                        : false
                    }
                  />
                );
              })}
            </AreaChart>
          </ChartContainer>
        )}

        {derived.chartFootnote ? (
          <p className="text-center text-body-sm text-muted-foreground">{derived.chartFootnote}</p>
        ) : null}

        {derived.cta === "banner" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileUp className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-body-sm">
                Import your positions to start building a timeline. Each import adds a snapshot point.
              </p>
            </div>
            <Button asChild variant="accent" size="sm" className="shrink-0">
              <Link href="/accounts">Add positions</Link>
            </Button>
          </div>
        ) : null}

        {derived.cta === "subtle" ? (
          <div className="text-right">
            <Link
              href="/accounts"
              className="text-body-sm text-foreground underline underline-offset-4 hover:underline"
            >
              Import more positions to grow your timeline →
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
  payload?: (ChartSnapshotPoint & { name?: string; t?: number }) | undefined;
};

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const dayMs = Date.parse(point.date);
  const dayLabel = Number.isFinite(dayMs)
    ? new Date(dayMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : String(point.date);
  const savedAtLabel = point.snapshotTakenAt
    ? new Date(point.snapshotTakenAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const ordered = [...REAL_STACK_ORDER].reverse().filter((s) => {
    const v = (point as Record<string, number | string | undefined>)[s.key];
    return typeof v === "number" && v > 0;
  });
  const total = snapshotTotal(point);

  return (
    <div className="grid min-w-44 max-w-xs gap-2 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-2">
      <div>
        <div className="font-medium leading-tight text-foreground">{dayLabel}</div>
        {savedAtLabel ? (
          <div className="text-[11px] text-muted-foreground">Saved {savedAtLabel}</div>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Total
        </span>
        <span className="font-mono text-sm font-medium tabular-nums leading-none text-foreground">
          <Provenance
            source="snapshots"
            footnote={SNAPSHOTS_PROVENANCE_FOOTNOTE}
            capturedAt={point.snapshotTakenAt}
          >
            {formatUsd(total, { compact: true })}
          </Provenance>
        </span>
      </div>
      {ordered.length > 0 ? (
        <>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            By class
          </div>
          <div className="grid gap-1">
            {ordered.map((s) => {
              const value = (point as Record<string, number | string | undefined>)[s.key] as number;
              return (
                <div key={s.key} className="flex items-center gap-2 text-[11px] leading-tight">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: stackColor(s.key) }}
                  />
                  <span className="min-w-0 flex-1 text-muted-foreground">{s.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-foreground">
                    {formatUsd(value, { compact: true })}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
