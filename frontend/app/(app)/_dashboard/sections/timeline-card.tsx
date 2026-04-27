"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import { Provenance } from "@/app/lib/provenance";
import { cn } from "@/app/lib/utils";

import {
  ASSET_CLASS_COLOR,
  formatPct,
  formatUsd,
  mockSnapshots,
  type AssetClass,
  type SnapshotPoint,
} from "../mocks";

type Period = "1W" | "1M" | "3M" | "YTD" | "1Y" | "All";

const PERIODS: Period[] = ["1W", "1M", "3M", "YTD", "1Y", "All"];

type TimelineKey = Extract<AssetClass, keyof SnapshotPoint>;

// Stable stack order: bottom → top. Don't sort by value.
const STACK_ORDER: Array<{ key: TimelineKey; label: string }> = [
  { key: "us-equity", label: "US equity" },
  { key: "fixed-income", label: "Fixed income" },
  { key: "intl-equity", label: "Intl equity" },
  { key: "real-estate", label: "Real estate" },
  { key: "cash", label: "Cash" },
];

const chartConfig: ChartConfig = Object.fromEntries(
  STACK_ORDER.map((s) => [s.key, { label: s.label, color: ASSET_CLASS_COLOR[s.key] }])
) satisfies ChartConfig;

function snapshotTotal(p: SnapshotPoint): number {
  return (
    p.cash +
    p["us-equity"] +
    p["intl-equity"] +
    p["fixed-income"] +
    p["real-estate"]
  );
}

function periodCutoff(latest: Date, period: Period): Date | null {
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

function filterSnapshots(snapshots: SnapshotPoint[], period: Period): SnapshotPoint[] {
  if (snapshots.length === 0) return snapshots;
  const latest = new Date(snapshots[snapshots.length - 1].date);
  const cutoff = periodCutoff(latest, period);
  if (!cutoff) return snapshots;
  const filtered = snapshots.filter((s) => new Date(s.date) >= cutoff);
  // Always show at least the latest 2 points so deltas are meaningful.
  return filtered.length >= 2 ? filtered : snapshots.slice(-2);
}

const tickFormatterX = (value: string) => {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

const tickFormatterY = (v: number) => formatUsd(v, { compact: true });

export function TimelineCard() {
  const [period, setPeriod] = React.useState<Period>("All");

  const filtered = React.useMemo(() => filterSnapshots(mockSnapshots, period), [period]);
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const firstTotal = snapshotTotal(first);
  const lastTotal = snapshotTotal(last);
  const deltaUsd = lastTotal - firstTotal;
  const deltaPct = firstTotal === 0 ? 0 : deltaUsd / firstTotal;
  const positive = deltaUsd >= 0;
  const sentiment = positive
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="h-full">
      <CardHeader className="flex-wrap">
        <CardTitle className="text-h3">Net worth over time</CardTitle>
        <CardDescription>Stacked by asset class</CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-mono",
              sentiment
            )}
          >
            <Provenance source="snapshots">
              {formatUsd(deltaUsd, { signed: true })} ·{" "}
              {formatPct(deltaPct, { signed: true, digits: 2 })}
            </Provenance>
            <Arrow className="size-3" aria-hidden />
          </span>
          <div
            role="group"
            aria-label="Time period"
            className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5"
          >
            {PERIODS.map((p) => {
              const active = p === period;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-sm px-2 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[16/6] w-full">
          <AreaChart data={filtered} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
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
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={tickFormatterX}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={56}
              tickFormatter={tickFormatterY}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              content={<TimelineTooltip />}
            />
            {STACK_ORDER.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="nw"
                stroke={`var(--color-${s.key})`}
                fill={`url(#fill-${s.key})`}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
  payload?: SnapshotPoint;
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
  const dateLabel = new Date(point.date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  // Display in stack order, top-down (reverse so highest area shows first).
  const ordered = [...STACK_ORDER].reverse();
  const total = snapshotTotal(point);

  return (
    <div className="grid min-w-[12rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{dateLabel}</div>
      <div className="grid gap-1">
        {ordered.map((s) => {
          const value = point[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: ASSET_CLASS_COLOR[s.key] }}
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
          <Provenance source="snapshots" capturedAt={point.date}>
            {formatUsd(total, { compact: true })}
          </Provenance>
        </span>
      </div>
    </div>
  );
}
