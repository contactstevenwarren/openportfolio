"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts/types/polar/Pie";

import {
  Card,
  CardContent,
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
const STUB_PROVENANCE = { source: "computed" } as const;

// Drift radius bounds in pixels. R_BASE matches the dashed baseline circle.
const R_BASE = 100;
const R_MIN = 90;
const R_MAX = 110;
const INNER_RADIUS = 70;

// Radial drift encoding: presentation constants, NOT band thresholds.
const DRIFT_FLOOR_PP = 1;
const DRIFT_CEILING_PP = 10;

// API L1 names → AssetClass slug used by ASSET_CLASS_COLOR.
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

// Canonical brand order for the legend (brand.md §Charts).
const CANONICAL_ORDER: AssetClass[] = [
  "cash", "us-equity", "intl-equity", "fixed-income",
  "real-estate", "crypto", "alts", "other",
];

type DisplaySlice = {
  name: string;
  cls: AssetClass;
  label: string;
  value: number;
  pct: number;
  targetPct: number | null;
  driftPct: number | null;
  driftBand: DriftBand | null;
  fill: string;
};

// Walk down through single-child layers so drilling Cash (which has only
// one region "other") goes straight to its sub_classes. The 3-level data
// tree (asset_class → region → sub_class) is preserved on the wire — this
// is purely a presentation transform.
export function meaningfulChildren(slice: AllocationSlice): AllocationSlice[] {
  const kids = slice.children ?? [];
  if (kids.length === 1) return meaningfulChildren(kids[0]);
  return kids;
}

// Generate a fill color for an L2 slice by mixing the parent's brand color
// with white in oklab space. index=0 is the darkest (parent color);
// higher index → progressively lighter. Capped at 60% mix so all slices
// remain visually readable against the card background.
function l2Fill(parentCssColor: string, index: number, total: number): string {
  const mix = total <= 1 ? 0 : Math.min(60, (index * 55) / (total - 1));
  return `color-mix(in oklab, ${parentCssColor}, white ${mix}%)`;
}

function toDisplaySlices(
  input: AllocationSlice[],
  opts: { sortByValueDesc?: boolean; parentCls?: AssetClass } = {},
): DisplaySlice[] {
  const visible = input.filter((s) => s.value > 0);
  const sorted = opts.sortByValueDesc
    ? [...visible].sort((a, b) => b.value - a.value)
    : [...visible].sort((a, b) => {
        const ac = NAME_TO_CLASS[a.name] ?? "other";
        const bc = NAME_TO_CLASS[b.name] ?? "other";
        const ai = CANONICAL_ORDER.indexOf(ac);
        const bi = CANONICAL_ORDER.indexOf(bc);
        if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return b.value - a.value;
      });

  const parentColor = opts.parentCls ? ASSET_CLASS_COLOR[opts.parentCls] : null;

  return sorted.map((s, i) => {
    const cls = NAME_TO_CLASS[s.name] ?? "other";
    const fill = parentColor
      ? l2Fill(parentColor, i, sorted.length)
      : ASSET_CLASS_COLOR[cls];
    return {
      name: s.name,
      cls,
      label: humanize(s.name),
      value: s.value,
      pct: s.pct,
      targetPct: s.target_pct ?? null,
      driftPct: s.drift_pct ?? null,
      driftBand: s.drift_band ?? null,
      fill,
    };
  });
}

// Per-slice outer radius in px. Linear growth from DRIFT_FLOOR_PP (flush) to
// DRIFT_CEILING_PP (full bump), saturated above.
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

  return (
    <Card className="h-full">
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
  const [zoomInto, setZoomInto] = React.useState<string | null>(null);
  const isSimulating = simulatedSlices != null;

  // Q5=C: simulating clears zoom and locks L1-only.
  React.useEffect(() => {
    if (isSimulating && zoomInto !== null) setZoomInto(null);
  }, [isSimulating, zoomInto]);

  const l1 = simulatedSlices ?? data?.by_asset_class ?? [];
  const zoomedParent = zoomInto ? (l1.find((s) => s.name === zoomInto) ?? null) : null;

  // Guard stale zoomInto: if the zoomed class disappears (e.g. position deleted
  // and SWR revalidates), snap back to L1 silently.
  React.useEffect(() => {
    if (zoomInto !== null && !l1.find((s) => s.name === zoomInto)) {
      setZoomInto(null);
    }
  }, [l1, zoomInto]);

  // Esc exits zoom.
  React.useEffect(() => {
    if (!zoomedParent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomInto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomedParent]);

  const parentCls = zoomedParent ? (NAME_TO_CLASS[zoomedParent.name] ?? "other") : undefined;
  const sourceSlices = zoomedParent ? meaningfulChildren(zoomedParent) : l1;
  const slices = toDisplaySlices(sourceSlices, {
    sortByValueDesc: zoomedParent != null,
    parentCls,
  });
  const rings = computeRings(slices);

  // Header description and focus link reflect zoom level.
  const description = zoomedParent
    ? `Inside ${humanize(zoomedParent.name)}`
    : "By asset class";
  // Pass focus class only when zoomed, drillable, and has meaningful children to edit.
  // Fixed Income and Real Estate are excluded until their L2 editor UX is enabled.
  const focusClass =
    zoomedParent &&
    zoomedParent.name !== "fixed_income" &&
    zoomedParent.name !== "real_estate" &&
    meaningfulChildren(zoomedParent).length > 1
      ? zoomedParent.name
      : null;

  function handleSliceClick(name: string) {
    if (isSimulating) return;
    if (zoomedParent) {
      // Clicking a slice inside the drill does nothing further (L3 deferred).
      return;
    }
    // At L1: drill if meaningful children exist, un-zoom if already zoomed.
    if (name === zoomInto) {
      setZoomInto(null);
      return;
    }
    // Fixed Income and Real Estate show multi-region data but their
    // L2 UX is not enabled yet — skip drill for those classes.
    if (name === "fixed_income" || name === "real_estate") return;
    const l1Slice = l1.find((s) => s.name === name);
    if (l1Slice && meaningfulChildren(l1Slice).length > 1) {
      setZoomInto(name);
    }
  }

  if (isLoading || (!data && !error)) {
    return (
      <>
        <DonutHeader description="By asset class" focusClass={null} />
        <DonutPlaceholder kind="loading" />
      </>
    );
  }
  if (error) {
    return (
      <>
        <DonutHeader description="By asset class" focusClass={null} />
        <DonutPlaceholder kind="error" message={(error as Error).message} />
      </>
    );
  }
  if (slices.length === 0 && !zoomedParent) {
    return (
      <>
        <DonutHeader description="By asset class" focusClass={null} />
        <DonutPlaceholder kind="empty" />
      </>
    );
  }

  const total = slices.reduce((a, s) => a + s.value, 0);

  const chartConfig: ChartConfig = {
    value: { label: "Allocation" },
    ...Object.fromEntries(
      slices.map((s) => [s.name, { label: s.label }]),
    ),
  };

  return (
    <>
      <DonutHeader description={description} focusClass={focusClass} />
      <div className="@container/donut-card">
        <div className="flex flex-col gap-6 @md/donut-card:flex-row @md/donut-card:items-center">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square w-full max-w-[260px] shrink-0 @md/donut-card:mx-0"
          >
            <PieChart>
              <ChartTooltip cursor={false} content={<DonutTooltip />} />
              <Pie
                data={slices.map((s) => ({ ...s, fill: s.fill }))}
                dataKey="value"
                nameKey="name"
                innerRadius={INNER_RADIUS}
                outerRadius={R_BASE}
                strokeWidth={3}
                stroke="var(--background)"
                shape={(rawProps: PieSectorShapeProps) => {
                  const { index = 0, ...props } = rawProps;
                  const sliceName = slices[index]?.name ?? "";
                  const l1Slice = !zoomedParent ? l1.find((s) => s.name === sliceName) : null;
                  const drillable = !isSimulating && !zoomedParent && l1Slice != null &&
                    sliceName !== "fixed_income" && sliceName !== "real_estate" &&
                    meaningfulChildren(l1Slice).length > 1;
                  return (
                    <Sector
                      {...props}
                      outerRadius={rings[index] ?? R_BASE}
                      style={{ cursor: drillable ? "pointer" : "default" }}
                    />
                  );
                }}
                onClick={(entry) => handleSliceClick((entry as { name: string }).name)}
                className="cursor-pointer"
              >
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                    const cx = viewBox.cx ?? 0;
                    const cy = viewBox.cy ?? 0;
                    if (zoomedParent) {
                      return (
                        <foreignObject x={cx - 70} y={cy - 32} width={140} height={64}>
                          <button
                            type="button"
                            onClick={() => setZoomInto(null)}
                            aria-label={`Back to all asset classes (currently inside ${humanize(zoomedParent.name)})`}
                            className="flex h-full w-full flex-col items-center justify-center text-center hover:opacity-80 transition-opacity"
                          >
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              ← {humanize(zoomedParent.name)}
                            </span>
                            <span className="font-mono text-xl font-medium text-accent">
                              <Provenance source={STUB_PROVENANCE.source}>
                                {formatUsd(zoomedParent.value, { compact: true })}
                              </Provenance>
                            </span>
                          </button>
                        </foreignObject>
                      );
                    }
                    return (
                      <foreignObject x={cx - 70} y={cy - 26} width={140} height={56}>
                        <div className="flex h-full w-full flex-col items-center justify-center text-center">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Total
                          </span>
                          <span className="font-mono text-xl font-medium text-accent">
                            <Provenance source={STUB_PROVENANCE.source}>
                              {formatUsd(total, { compact: true })}
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
            {slices.map((s) => {
              // At L1: clicking drills if there are meaningful children, or
              // un-zooms if this slice is currently the zoomed parent.
              // At L2: clicking the parent name in a breadcrumb would un-zoom
              // but we don't render the parent row here — no-op.
              const l1Slice = !zoomedParent ? l1.find((ls) => ls.name === s.name) : undefined;
              const isDrillable = !isSimulating && l1Slice != null &&
                s.name !== "fixed_income" && s.name !== "real_estate" &&
                meaningfulChildren(l1Slice).length > 1;
              return (
                <div key={s.name}>
                  <button
                    type="button"
                    onClick={() => handleSliceClick(s.name)}
                    aria-label={`${s.label}: ${formatUsd(s.value, { compact: true })}`}
                    className={
                      "grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                      (isDrillable ? "cursor-pointer" : "cursor-default")
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: s.fill }}
                      />
                      <span className="truncate text-body-sm text-foreground">{s.label}</span>
                      {isDrillable && (
                        <span aria-hidden className="text-[10px] text-muted-foreground/50">›</span>
                      )}
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
            {zoomedParent && (
              <button
                type="button"
                onClick={() => setZoomInto(null)}
                className="mt-1 px-2 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to all asset classes
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Header is rendered inside DonutBody so it can reflect zoom state.
// focusClass is set when the user is zoomed into a drillable asset class,
// so Edit targets lands directly in the L2 editor for that class.
function DonutHeader({ description, focusClass }: { description: string; focusClass: string | null }) {
  const targetsHref = focusClass ? `/targets?focus=${focusClass}` : "/targets";
  return (
    <div className="flex items-start justify-between pb-4">
      <div>
        <p className="text-h3 font-semibold leading-none tracking-tight">Allocation</p>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Link
        href={targetsHref}
        className="text-body-sm text-muted-foreground hover:text-foreground"
      >
        Edit targets →
      </Link>
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
