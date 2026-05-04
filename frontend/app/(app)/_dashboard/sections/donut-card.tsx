"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts/types/polar/Pie";

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
import {
  api,
  type AllocationResult,
  type AllocationSlice,
  type DriftBand,
} from "@/app/lib/api";
import { useSandbox } from "@/app/lib/sandbox-context";
import { humanize } from "@/app/lib/labels";
import { Provenance } from "@/app/lib/provenance";
import { ASSET_CLASS_COLOR, formatPct, formatUsd, type AssetClass } from "../mocks";

// API doesn't yet carry per-slice freshness; stub a static source so the
// dotted-underline + hover tooltip show up everywhere a number is rendered.
// Replace with real freshness once the backend plumbs it through.
const STUB_PROVENANCE = { source: "computed" } as const;

// Drift radius bounds in pixels. R_BASE matches the dashed baseline circle.
const R_BASE = 100;
const R_MIN = 90;
const R_MAX = 110;
const INNER_RADIUS = 70;
// Selection cue: dim non-selected wedges. Radius stays untouched so it
// keeps representing drift only.
const DIM_OPACITY = 0.35;

// Radial drift encoding: presentation constants, NOT band thresholds. Below
// DRIFT_FLOOR_PP the wedge sits flush; at DRIFT_CEILING_PP it reaches the
// full bump. Linear in-between, saturated past the ceiling. Decoupled from
// the band thresholds so the chart stays a quiet drift signal.
const DRIFT_FLOOR_PP = 1;
const DRIFT_CEILING_PP = 10;

// API L1 names → AssetClass slug used by ASSET_CLASS_COLOR.
// L1 "equity" lumps US + intl; the donut shows the lump, so we route it
// through the US-equity blue. Anything not listed falls back to "other".
export const NAME_TO_CLASS: Record<string, AssetClass> = {
  cash: "cash",
  equity: "us-equity",
  us_equity: "us-equity",
  intl_equity: "intl-equity",
  fixed_income: "fixed-income",
  real_estate: "real-estate",
  crypto: "crypto",
  alts: "alts",
  other: "other",
};

type DisplaySlice = {
  name: string;
  cls: AssetClass;
  label: string;
  value: number;
  pct: number;
  targetPct: number | null;
  driftPct: number | null;
  driftBand: DriftBand | null;
};

// Canonical brand order for the legend (brand.md §Charts).
const CANONICAL_ORDER: AssetClass[] = [
  "cash", "us-equity", "intl-equity", "fixed-income",
  "real-estate", "crypto", "alts", "other",
];

function toDisplaySlices(input: AllocationSlice[]): DisplaySlice[] {
  return [...input]
    .filter((s) => s.value > 0)
    .map((s) => ({
      name: s.name,
      cls: NAME_TO_CLASS[s.name] ?? "other",
      label: humanize(s.name),
      value: s.value,
      pct: s.pct,
      targetPct: s.target_pct ?? null,
      driftPct: s.drift_pct ?? null,
      driftBand: s.drift_band ?? null,
    }))
    .sort((a, b) => {
      const ai = CANONICAL_ORDER.indexOf(a.cls);
      const bi = CANONICAL_ORDER.indexOf(b.cls);
      // Unknown classes go last; within same class sort by value desc
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return b.value - a.value;
    });
}

// Per-slice outer radius in px. Linear growth from DRIFT_FLOOR_PP (flush) to
// DRIFT_CEILING_PP (full bump), saturated above. Endpoints are presentation
// constants, deliberately decoupled from the band thresholds.
function computeRings(slices: DisplaySlice[]): number[] {
  const span = DRIFT_CEILING_PP - DRIFT_FLOOR_PP;
  return slices.map((s) => {
    if (s.driftPct == null) return R_BASE;
    const abs = Math.abs(s.driftPct);
    if (abs <= DRIFT_FLOOR_PP) return R_BASE;
    const ratio = Math.min(1, (abs - DRIFT_FLOOR_PP) / span);
    return s.driftPct > 0
      ? R_BASE + ratio * (R_MAX - R_BASE)
      : R_BASE - ratio * (R_BASE - R_MIN);
  });
}

export function DonutCard() {
  const { data, error, isLoading } = useSWR<AllocationResult>(
    "/api/allocation",
    api.allocation,
  );
  const { simulatedSlices } = useSandbox();
  const isSimulating = simulatedSlices != null;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">
          Allocation
        </CardTitle>
        <CardDescription>By asset class</CardDescription>
        <CardAction>
          <Link
            href="/targets"
            className="text-body-sm text-muted-foreground hover:text-foreground"
          >
            Edit targets →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DonutBody
          data={data}
          error={error}
          isLoading={isLoading}
          simulatedSlices={simulatedSlices}
        />
      </CardContent>
    </Card>
  );
}

function DonutBody({
  data,
  error,
  isLoading,
  simulatedSlices,
}: {
  data: AllocationResult | undefined;
  error: unknown;
  isLoading: boolean;
  simulatedSlices: AllocationSlice[] | undefined;
}) {
  const [selected, setSelected] = React.useState<number | null>(null);

  const slices = toDisplaySlices(simulatedSlices ?? data?.by_asset_class ?? []);
  const rings = computeRings(slices);

  if (isLoading || (!data && !error)) {
    return <DonutPlaceholder kind="loading" />;
  }
  if (error) {
    return <DonutPlaceholder kind="error" message={(error as Error).message} />;
  }
  if (slices.length === 0) {
    return <DonutPlaceholder kind="empty" />;
  }

  const total = slices.reduce((a, s) => a + s.value, 0);
  const activeIndex = selected ?? 0;
  const activeSlice = slices[activeIndex];
  const isSelected = selected !== null;
  const toggle = (i: number) => setSelected((prev) => (prev === i ? null : i));

  const chartData = slices.map((s) => ({
    cls: s.cls,
    label: s.label,
    value: s.value,
    pct: s.pct,
    targetPct: s.targetPct,
    driftPct: s.driftPct,
    fill: `var(--color-${s.cls})`,
  }));

  const chartConfig: ChartConfig = {
    value: { label: "Allocation" },
    ...Object.fromEntries(
      slices.map((s) => [s.cls, { label: s.label, color: ASSET_CLASS_COLOR[s.cls] }]),
    ),
  };

  return (
    <div className="@container/donut-card">
      <div className="flex flex-col gap-6 @md/donut-card:flex-row @md/donut-card:items-center">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[260px] shrink-0 @md/donut-card:mx-0"
        >
          <PieChart>
            <ChartTooltip cursor={false} content={<DonutTooltip />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="cls"
              innerRadius={INNER_RADIUS}
              outerRadius={R_BASE}
              strokeWidth={3}
              stroke="var(--background)"
              shape={(rawProps: PieSectorShapeProps) => {
                const { index = 0, ...props } = rawProps;
                const dim = isSelected && index !== activeIndex;
                return (
                  <Sector
                    {...props}
                    outerRadius={rings[index] ?? R_BASE}
                    opacity={dim ? DIM_OPACITY : 1}
                  />
                );
              }}
              onClick={(_, i) => toggle(i)}
              className="cursor-pointer"
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  const cx = viewBox.cx ?? 0;
                  const cy = viewBox.cy ?? 0;
                  const labelText = isSelected ? activeSlice.label : "Total";
                  const valueText = isSelected
                    ? formatUsd(activeSlice.value, { compact: true })
                    : formatUsd(total, { compact: true });
                  return (
                    <foreignObject x={cx - 70} y={cy - 26} width={140} height={56}>
                      <div className="flex h-full w-full flex-col items-center justify-center text-center">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {labelText}
                        </span>
                        <span className="font-mono text-xl font-medium text-accent">
                          <Provenance source={STUB_PROVENANCE.source}>
                            {valueText}
                          </Provenance>
                        </span>
                      </div>
                    </foreignObject>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="flex flex-1 flex-col gap-0.5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-2 pb-1.5">
            <span className="text-label text-muted-foreground">Asset type</span>
            <span className="w-14 text-right text-label text-muted-foreground">Amount</span>
            <span className="w-12 text-right text-label text-muted-foreground">Target</span>
            <span className="w-14 text-right text-label text-muted-foreground">Drift</span>
          </div>
          {slices.map((s, i) => {
            const isActive = i === activeIndex;
            return (
              <div key={s.name}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isSelected && isActive}
                  className={
                    "grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (isSelected && isActive ? "bg-muted/40" : "")
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: ASSET_CLASS_COLOR[s.cls] }}
                    />
                    <span className="truncate text-body-sm text-foreground">{s.label}</span>
                  </span>
                  <span className="w-14 text-right text-mono-sm tabular-nums text-muted-foreground">
                    <Provenance source={STUB_PROVENANCE.source}>
                      {formatUsd(s.value, { compact: true })}
                    </Provenance>
                  </span>
                  <span className="w-12 text-right text-mono-sm tabular-nums text-muted-foreground">
                    {s.targetPct != null ? formatPct(s.targetPct / 100, { digits: 0 }) : "—"}
                  </span>
                  <span className={`w-14 text-right text-mono-sm tabular-nums ${driftColor(s.driftBand)}`}>
                    {s.driftPct != null ? formatPp(s.driftPct) : "—"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type TooltipPayload = {
  label: string;
  value: number;
  pct: number;
  targetPct: number | null;
  driftPct: number | null;
};

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TooltipPayload }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const showDrift = p.targetPct != null && p.driftPct != null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{p.label}</div>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {formatUsd(p.value, { compact: true })} · {formatPct(p.pct / 100)}
      </div>
      {showDrift ? (
        <div className="mt-0.5 text-muted-foreground tabular-nums">
          target {Math.round(p.targetPct!)}% · {formatPp(p.driftPct!)}
        </div>
      ) : null}
    </div>
  );
}

function formatPp(pp: number): string {
  const sign = pp > 0 ? "+" : pp < 0 ? "−" : "";
  return `${sign}${Math.abs(pp).toFixed(1)}pp`;
}

function driftColor(band: DriftBand | null): string {
  if (!band || band === "ok") return "text-muted-foreground";
  if (band === "urgent") return "text-destructive";
  return "text-warning";
}

function DonutPlaceholder({
  kind,
  message,
}: {
  kind: "loading" | "error" | "empty";
  message?: string;
}) {
  const text =
    kind === "loading"
      ? "Loading allocation…"
      : kind === "empty"
        ? "No allocation yet. Add positions to see the donut."
        : `Couldn't load allocation. ${message ?? ""}`.trim();
  return (
    <div className="@container/donut-card">
      <div className="flex flex-col gap-6 @md/donut-card:flex-row @md/donut-card:items-center">
        <div className="mx-auto flex aspect-square w-full max-w-[260px] shrink-0 items-center justify-center rounded-full border border-dashed border-border @md/donut-card:mx-0">
          <span className="px-6 text-center text-body-sm text-muted-foreground">{text}</span>
        </div>
        <div className="flex-1" aria-hidden />
      </div>
    </div>
  );
}

