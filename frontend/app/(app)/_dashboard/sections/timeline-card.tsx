"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, FileUp } from "lucide-react";
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
import { Provenance } from "@/app/lib/provenance";
import { cn } from "@/app/lib/utils";

import { formatUsd } from "../mocks";
import {
  defaultPeriodForSeries,
  defaultPeriodForSparseSeries,
  deriveTimelineUi,
  filterSnapshots,
  getTimelineMockSeries,
  periodControls,
  snapshotTotal,
  STACK_ORDER,
  type ChartState,
  type Period,
} from "../timeline-state";
import { TIMELINE_STACK_COLORS, type SnapshotPoint } from "../timeline-mocks";

const chartConfig: ChartConfig = Object.fromEntries(
  [
    ["portfolio", { label: "Investable total", color: "var(--success)" }],
    ...STACK_ORDER.map((s) => [s.key, { label: s.label, color: TIMELINE_STACK_COLORS[s.key] }] as const),
  ],
) satisfies ChartConfig;

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

/** Top of stack in draw order — vertex dots for sparse mode. */
const SPARSE_DOT_STACK_KEY = STACK_ORDER[STACK_ORDER.length - 1]!.key;

const PREVIEW_OPTIONS: ChartState[] = ["anchor", "sparse", "full"];

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

function AnchorTodayChart({ totalUsd }: { totalUsd: number }) {
  const yMax = React.useMemo(() => anchorYAxisMax(totalUsd), [totalUsd]);
  const data = React.useMemo(
    (): AnchorScatterPoint[] => [{ x: "Today", y: totalUsd }],
    [totalUsd],
  );

  return (
    <div className="relative h-36 w-full sm:h-40">
      <ChartContainer config={chartConfig} className="h-full min-h-0 w-full aspect-auto">
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
                  <span className="font-mono font-medium tabular-nums">
                    {formatUsd((payload[0].payload as AnchorScatterPoint).y, { compact: true })}
                  </span>
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
      <p
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-body-sm italic text-muted-foreground"
        aria-hidden
      >
        History will build from here →
      </p>
    </div>
  );
}

export function TimelineCard() {
  const [previewMode, setPreviewMode] = React.useState<ChartState>("full");
  const [period, setPeriod] = React.useState<Period>("All");

  const series = React.useMemo(() => getTimelineMockSeries(previewMode), [previewMode]);

  React.useEffect(() => {
    setPeriod(
      previewMode === "sparse"
        ? defaultPeriodForSparseSeries(series)
        : defaultPeriodForSeries(series),
    );
  }, [previewMode, series]);

  const latest = React.useMemo(
    () => new Date(series[series.length - 1]?.date ?? Date.now()),
    [series],
  );

  const filtered = React.useMemo(
    () => filterSnapshots(series, period, latest),
    [series, period, latest],
  );

  const periodMeta = React.useMemo(
    () => periodControls(previewMode, series, latest),
    [previewMode, series, latest],
  );

  const derived = React.useMemo(
    () => deriveTimelineUi(previewMode, series, filtered),
    [previewMode, series, filtered],
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
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;

  const anchorTotal = series[0] ? snapshotTotal(series[0]) : 0;

  const isSparseChart = previewMode === "sparse";

  const stackedChartData = React.useMemo(() => {
    if (!isSparseChart) return filtered;
    return filtered.map((p) => ({ ...p, t: parseChartDate(p.date) }));
  }, [isSparseChart, filtered]);

  const sparseXLayout = React.useMemo((): { domain: [number, number]; lastT: number } | null => {
    if (!isSparseChart || filtered.length < 1) return null;
    const ts = filtered.map((p) => parseChartDate(p.date));
    const tMin = ts[0]!;
    const tMax = ts[ts.length - 1]!;
    const span = Math.max(tMax - tMin, 86_400_000);
    const runway = Math.max(Math.round(span * 0.45), 86_400_000 * 21);
    return { domain: [tMin, tMax + runway], lastT: tMax };
  }, [isSparseChart, filtered]);

  const formatSparseXTickNumber = React.useCallback(
    (ts: number) => {
      const layout = sparseXLayout;
      if (layout && utcDayEqual(ts, layout.lastT)) return "Today";
      return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    },
    [sparseXLayout],
  );

  return (
    <Card className="h-full">
      <CardHeader className="flex-wrap gap-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-h3">Investable portfolio over time</CardTitle>
            <CardDescription className="text-pretty">{derived.subtitle}</CardDescription>
          </div>
          <div
            className="flex shrink-0 flex-col gap-1 rounded-md border border-dashed border-amber-600/40 bg-amber-500/5 px-2 py-1.5 dark:border-amber-500/30 dark:bg-amber-500/10"
            role="group"
            aria-label="Preview chart state (temporary)"
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
              Preview (remove before ship)
            </span>
            <div className="flex flex-wrap gap-1">
              {PREVIEW_OPTIONS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="xs"
                  variant={previewMode === m ? "default" : "outline"}
                  className="capitalize"
                  onClick={() => setPreviewMode(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
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
                  source="computed"
                  footnote="Illustrative series in v0.1; matches allocation scope (investable only)."
                >
                  {formatUsd(deltaUsd, { signed: true })} ·{" "}
                  {formatPct(deltaPct, { signed: true, digits: 2 })}
                </Provenance>
                <Arrow className="size-3" aria-hidden />
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
              const active = previewMode !== "anchor" && p === period;
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
        {previewMode === "anchor" ? (
          <AnchorTodayChart totalUsd={anchorTotal} />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-[16/6] w-full">
            <AreaChart data={stackedChartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                {STACK_ORDER.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`fill-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={`var(--color-${s.key})`}
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="100%"
                      stopColor={`var(--color-${s.key})`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                ))}
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
              {STACK_ORDER.map((s) => (
                <Area
                  key={s.key}
                  type={isSparseChart ? "linear" : "monotone"}
                  dataKey={s.key}
                  stackId="nw"
                  stroke={`var(--color-${s.key})`}
                  fill={`url(#fill-${s.key})`}
                  strokeWidth={isSparseChart ? 1.25 : 1.5}
                  isAnimationActive={false}
                  dot={
                    isSparseChart && s.key === SPARSE_DOT_STACK_KEY
                      ? { r: 4, fill: "var(--foreground)", stroke: "var(--background)", strokeWidth: 1 }
                      : false
                  }
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}

        {derived.cta === "banner" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-sky-200/80 bg-sky-100/90 px-4 py-3 text-sky-950 sm:flex-row sm:items-center sm:justify-between dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-50">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileUp className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
              <p className="text-body-sm">
                Upload past statements to fill in history. Each statement adds a data point.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 border-sky-300 bg-white/80 text-sky-950 hover:bg-white dark:border-sky-700 dark:bg-sky-900/50 dark:text-sky-50 dark:hover:bg-sky-900">
              <Link href="/accounts">Upload PDF</Link>
            </Button>
          </div>
        ) : null}

        {derived.cta === "subtle" ? (
          <div className="text-right">
            <Link
              href="/accounts"
              className="text-body-sm text-sky-700 underline-offset-4 hover:text-sky-900 hover:underline dark:text-sky-300 dark:hover:text-sky-100"
            >
              Upload more statements for longer history →
            </Link>
          </div>
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
  payload?: SnapshotPoint & { name?: string };
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
  const dateLabel =
    point.name === "Today"
      ? "Today"
      : new Date(point.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
  const ordered = [...STACK_ORDER].reverse();
  const total = snapshotTotal(point);

  return (
    <div className="grid min-w-48 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{dateLabel}</div>
      <div className="grid gap-1">
        {ordered.map((s) => {
          const value = point[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: TIMELINE_STACK_COLORS[s.key] }}
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
          <Provenance source="computed" capturedAt={point.date}>
            {formatUsd(total, { compact: true })}
          </Provenance>
        </span>
      </div>
    </div>
  );
}
