import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts/types/polar/Pie";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart";

const meta = {
  title: "Primitives/Chart",
  component: ChartContainer,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const chartData = [
  { category: "Cash", label: "Cash", value: 67791, fill: "var(--viz-cash)" },
  { category: "Stocks", label: "Stocks", value: 516909, fill: "var(--viz-stocks)" },
  { category: "Bonds", label: "Bonds", value: 152531, fill: "var(--viz-bonds)" },
  { category: "Real Estate", label: "Real Estate", value: 110161, fill: "var(--viz-real-estate)" },
];

const config = {
  value: { label: "Allocation" },
  Cash: { label: "Cash", color: "var(--viz-cash)" },
  Stocks: { label: "Stocks", color: "var(--viz-stocks)" },
  Bonds: { label: "Bonds", color: "var(--viz-bonds)" },
  "Real Estate": { label: "Real Estate", color: "var(--viz-real-estate)" },
} satisfies ChartConfig;

const total = chartData.reduce((acc, d) => acc + d.value, 0);
const ACTIVE_INDEX = chartData.reduce(
  (best, d, i) => (d.value > chartData[best].value ? i : best),
  0
);

export const DonutActive: Story = {
  render: () => (
    <ChartContainer config={config} className="aspect-square w-[300px]">
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
  ),
};
