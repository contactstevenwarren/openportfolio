"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/app/components/ui/chart";

const data = [
  { category: "cash", label: "Cash", value: 8 },
  { category: "us-equity", label: "US equity", value: 47 },
  { category: "intl-equity", label: "Intl equity", value: 14 },
  { category: "fixed-income", label: "Fixed income", value: 18 },
  { category: "real-estate", label: "Real estate", value: 13 },
];

const config = {
  value: { label: "Allocation" },
  cash: { label: "Cash", color: "var(--viz-cash)" },
  "us-equity": { label: "US equity", color: "var(--viz-us-equity)" },
  "intl-equity": { label: "Intl equity", color: "var(--viz-intl-equity)" },
  "fixed-income": { label: "Fixed income", color: "var(--viz-fixed-income)" },
  "real-estate": { label: "Real estate", color: "var(--viz-real-estate)" },
} satisfies ChartConfig;

export function BrandDonut() {
  return (
    <div className="relative">
      <ChartContainer config={config} className="h-[260px] w-[260px]">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="label" hideLabel />}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="category"
            innerRadius={70}
            outerRadius={110}
            stroke="var(--background)"
            strokeWidth={3}
            paddingAngle={0}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell
                key={entry.category}
                fill={`var(--color-${entry.category})`}
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-label text-muted-foreground">Total</span>
        <span className="text-mono text-accent font-medium">$847,392</span>
      </div>
    </div>
  );
}
