"use client";

import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts/types/polar/Pie";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/app/components/ui/chart";

const chartData = [
  {
    category: "Stocks",
    label: "Stocks",
    value: 516909,
    fill: "var(--viz-stocks)",
  },
  {
    category: "Bonds",
    label: "Bonds",
    value: 152531,
    fill: "var(--viz-bonds)",
  },
  { category: "Cash", label: "Cash", value: 67791, fill: "var(--viz-cash)" },
  {
    category: "Real Estate",
    label: "Real Estate",
    value: 110161,
    fill: "var(--viz-real-estate)",
  },
];

const chartConfig = {
  value: { label: "Allocation" },
  Stocks: { label: "Stocks", color: "var(--viz-stocks)" },
  Bonds: { label: "Bonds", color: "var(--viz-bonds)" },
  Cash: { label: "Cash", color: "var(--viz-cash)" },
  "Real Estate": { label: "Real Estate", color: "var(--viz-real-estate)" },
} satisfies ChartConfig;

const total = chartData.reduce((acc, d) => acc + d.value, 0);
const ACTIVE_INDEX = chartData.reduce(
  (best, d, i) => (d.value > chartData[best].value ? i : best),
  0
);

export function BrandDonut() {
  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square w-full max-w-[280px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="label" hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="category"
          innerRadius={70}
          strokeWidth={3}
          stroke="var(--background)"
          shape={({ index, outerRadius = 0, ...props }: PieSectorShapeProps) =>
            index === ACTIVE_INDEX ? (
              <Sector {...props} outerRadius={outerRadius + 8} />
            ) : (
              <Sector {...props} outerRadius={outerRadius} />
            )
          }
        >
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 10}
                      className="fill-muted-foreground text-[11px] font-medium tracking-wide uppercase"
                    >
                      Total
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 12}
                      className="fill-accent font-mono text-xl font-medium"
                    >
                      ${total.toLocaleString()}
                    </tspan>
                  </text>
                );
              }
              return null;
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
