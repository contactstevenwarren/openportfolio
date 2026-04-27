"use client";

import * as React from "react";
import Link from "next/link";
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
  ChartTooltipContent,
  type ChartConfig,
} from "@/app/components/ui/chart";
import { Provenance } from "@/app/lib/provenance";
import {
  ASSET_CLASS_COLOR,
  formatPct,
  formatUsd,
  mockAllocation,
  mockNetWorth,
} from "../mocks";

// Sort by value desc — drives both legend order and pie-slice index.
const slices = [...mockAllocation].sort((a, b) => b.value - a.value);
const total = slices.reduce((acc, s) => acc + s.value, 0);

const chartData = slices.map((s) => ({
  class: s.class,
  label: s.label,
  value: s.value,
  fill: `var(--color-${s.class})`,
}));

const chartConfig: ChartConfig = {
  value: { label: "Allocation" },
  ...Object.fromEntries(
    slices.map((s) => [s.class, { label: s.label, color: ASSET_CLASS_COLOR[s.class] }])
  ),
};

// Default-active = largest slice (index 0 after sort).
const DEFAULT_ACTIVE = 0;

export function DonutCard() {
  const [selected, setSelected] = React.useState<number | null>(null);
  const activeIndex = selected ?? DEFAULT_ACTIVE;
  const activeSlice = slices[activeIndex];
  const isSelected = selected !== null;

  const toggle = (i: number) => {
    setSelected((prev) => (prev === i ? null : i));
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-h3">Allocation</CardTitle>
        <CardDescription>By asset class</CardDescription>
        <CardAction>
          <Link
            href="/legacy/positions"
            className="text-body-sm text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="@container/donut-card">
          <div className="flex flex-col gap-6 @md/donut-card:flex-row @md/donut-card:items-center">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square w-full max-w-[260px] shrink-0 @md/donut-card:mx-0"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey="label" hideLabel />}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="class"
                  innerRadius={70}
                  strokeWidth={3}
                  stroke="var(--background)"
                  shape={({ index, outerRadius = 0, ...props }: PieSectorShapeProps) =>
                    index === activeIndex ? (
                      <Sector {...props} outerRadius={outerRadius + 8} />
                    ) : (
                      <Sector {...props} outerRadius={outerRadius} />
                    )
                  }
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
                      const fresh = isSelected ? activeSlice.freshness : mockNetWorth.freshness;
                      return (
                        <foreignObject x={cx - 70} y={cy - 26} width={140} height={56}>
                          <div className="flex h-full w-full flex-col items-center justify-center text-center">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {labelText}
                            </span>
                            <span className="font-mono text-xl font-medium text-foreground">
                              <Provenance
                                source={fresh.source}
                                confidence={fresh.confidence}
                                capturedAt={fresh.capturedAt}
                              >
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

            <ul className="flex flex-1 flex-col gap-1">
              {slices.map((s, i) => {
                const isActive = i === activeIndex;
                return (
                  <li key={s.class}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={isSelected && isActive}
                      className={
                        "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (isActive ? "bg-muted/40" : "")
                      }
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: ASSET_CLASS_COLOR[s.class] }}
                      />
                      <span className="flex-1 truncate text-body-sm text-foreground">
                        {s.label}
                      </span>
                      <span className="text-mono-sm tabular-nums text-muted-foreground">
                        <Provenance
                          source={s.freshness.source}
                          confidence={s.freshness.confidence}
                          capturedAt={s.freshness.capturedAt}
                        >
                          {formatPct(s.pct)}
                        </Provenance>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
