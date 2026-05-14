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
  CardAction,
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
import { formatPct } from "@/app/lib/format";
import { api } from "@/app/lib/api";
import { Provenance } from "@/app/lib/provenance";
import { cn } from "@/app/lib/utils";

import { formatUsd } from "../mocks";
import {
  REAL_STACK_ORDER,
  SPARSE_DOT_STACK_KEY_REAL,
  allocationToAnchorSeries,
  chartColorVarSegment,
  isRealSnapshotPoint,
  snapshotsToSeries,
  stackColor,
} from "../snapshot-series";
import {
  defaultPeriodForSeries,
  defaultPeriodForSparseSeries,
  deriveTimelineUi,
  filterSnapshots,
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

function parseChartDate(isoDate: string): number {
  return Date.parse(isoDate.includes("T") ? isoDate : `${isoDate}T12:00:00Z`);
}

function utcDayEqual(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

const SNAPSHOTS_PROVENANCE_FOOTNOTE =
  "Each point reflects the investable total when that snapshot was saved. The chart time is the latest as-of date among investable positions (usually your statement date); hover shows the exact save time.";

type AnchorScatterPoint = { x: string; y: number };

function anchorYAxisMax(totalUsd: number): number {
  if (totalUsd <= 0) return 600_000;
  const step = 200_000;
  return Math.max(600_000, Math.ceil((totalUsd * 1.12) / step) * step);
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
      {showBuildingHint ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-body-sm italic text-muted-foreground"
          aria-hidden
        >
          History builds as you import or commit positions →
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
    () => deriveTimelineUi(chartState, series, filtered),
    [chartState, series, filtered],
  );

  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const hasPillData = derived.showPerformancePill && first && last;
  const firstTotal = first ? snapshotTotal(first) : 0;
  const lastTotal = last ? snapshotTotal(last) : 0;
  const deltaUsd = lastTotal - firstTotal;
  const deltaPct = firstTotal === 0 ? 0 : deltaUsd / firstTotal;
  const positive = deltaUsd >= 0;
  const sentiment = positive
    ? "bg-success-soft text-success"
    : "bg-destructive-soft text-destructive";
  const trendGlyph = positive ? "\u2197" : "\u2198";

  const anchorTotal = series[0] ? snapshotTotal(series[0]) : 0;

  const lastSnapshotTakenAt =
    hasRealSnapshots && snapshotList?.length ? snapshotList[snapshotList.length - 1]!.taken_at : null;

  const performanceCapturedAt = hasPillData ? (lastSnapshotTakenAt ?? last?.date ?? null) : null;

  const isSparseChart = chartState === "sparse";

  const stackedChartData = React.useMemo(() => {
    if (!isSparseChart) return filtered;
    return filtered.map((p) => ({ ...p, t: parseChartDate(p.date) }));
  }, [isSparseChart, filtered]);

  const sparseXLayout = React.useMemo(():
    | { domain: [number, number]; lastT: number; tickWithTime: boolean }
    | null => {
    if (!isSparseChart || filtered.length < 1) return null;
    const ts = filtered.map((p) => parseChartDate(p.date));
    const tMin = ts[0]!;
    const tMax = ts[ts.length - 1]!;
    // Avoid forcing a full-day minimum when two snapshots land minutes apart (same import session);
    // otherwise both points stack on the left and the chart looks "broken".
    const rawSpan = tMax - tMin;
    const span = Math.max(rawSpan, 3_600_000); // at least 1h of axis width for readability
    // Proportional future band; avoid a multi-week minimum runway when history is only hours/days wide.
    const runway = Math.max(Math.round(span * 0.55), 3_600_000);
    return {
      domain: [tMin, tMax + runway] as [number, number],
      lastT: tMax,
      /** When true, X ticks include clock time (same calendar day commits). */
      tickWithTime: rawSpan < 86_400_000,
    };
  }, [isSparseChart, filtered]);

  const formatSparseXTickNumber = React.useCallback(
    (ts: number) => {
      const layout = sparseXLayout;
      if (layout && ts === layout.lastT && utcDayEqual(ts, Date.now())) return "Today";
      const opts: Intl.DateTimeFormatOptions = layout?.tickWithTime
        ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric" };
      return new Date(ts).toLocaleString(undefined, opts);
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

  return (
    <Card className="h-full">
      <CardHeader className="flex-wrap gap-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-h3">Investable portfolio over time</CardTitle>
            <CardDescription className="text-pretty">{derived.subtitle}</CardDescription>
          </div>
        </div>

        <CardAction className="flex w-full flex-col gap-2 @lg/card-header:max-w-full">
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {hasPillData ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-mono",
                  sentiment,
                )}
              >
                <Provenance
                  source="snapshots"
                  footnote={SNAPSHOTS_PROVENANCE_FOOTNOTE}
                  capturedAt={performanceCapturedAt}
                >
                  {formatUsd(deltaUsd, { signed: true })} ·{" "}
                  {formatPct(deltaPct, { signed: true, digits: 2 })}
                </Provenance>
                <span className="font-sans text-sm leading-none" aria-hidden>
                  {trendGlyph}
                </span>
              </span>
            ) : null}
            {hasPillData && derived.performanceSinceCaption ? (
              <span className="text-body-sm text-muted-foreground">{derived.performanceSinceCaption}</span>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="Time period"
            className="flex w-full flex-wrap items-center justify-end gap-0.5 rounded-md border bg-background p-0.5"
          >
            {periodMeta.map(({ period: p, disabled, title }) => {
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
            })}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {!chartReady ? (
          <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-8 text-body-sm text-muted-foreground">
            {snapshotsError || allocationError
              ? "Could not load timeline data. Check your connection and admin token, then reload."
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

        {derived.cta === "banner" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileUp className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-body-sm">
                Import your positions to start building a timeline. Each import adds a snapshot point.
              </p>
            </div>
            <Button asChild variant="accent" size="sm" className="shrink-0">
              <Link href="/accounts">Upload PDF</Link>
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

        {hasRealSnapshots ? (
          <p className="text-center text-body-sm text-muted-foreground">{SNAPSHOTS_PROVENANCE_FOOTNOTE}</p>
        ) : null}

        {derived.chartFootnote ? (
          <p className="text-center text-body-sm text-muted-foreground">{derived.chartFootnote}</p>
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
  const d = new Date(point.date);
  const dateLabel = Number.isFinite(d.getTime())
    ? point.date.includes("T")
      ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
    : String(point.date);
  const ordered = [...REAL_STACK_ORDER].reverse();
  const total = snapshotTotal(point);
  const provenanceCapturedAt =
    isRealSnapshotPoint(point) ? point.snapshotTakenAt : point.date;

  return (
    <div className="grid min-w-48 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-2">
      <div className="font-medium">{dateLabel}</div>
      <div className="grid gap-1">
        {ordered.map((s) => {
          const value = (point as Record<string, number | string | undefined>)[s.key] as number;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: stackColor(s.key) }}
              />
              <span className="flex-1 text-muted-foreground">{s.label}</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatUsd(value, { compact: true })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-1.5">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          <Provenance
            source="snapshots"
            footnote={SNAPSHOTS_PROVENANCE_FOOTNOTE}
            capturedAt={provenanceCapturedAt}
          >
            {formatUsd(total, { compact: true })}
          </Provenance>
        </span>
      </div>
    </div>
  );
}
