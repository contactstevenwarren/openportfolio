import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Cell, Pie, PieChart } from "recharts";

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

export const AllocationDonut: Story = {
  render: () => (
    <ChartContainer config={config} className="h-[300px] w-[300px]">
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="label" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="category"
          innerRadius={80}
          outerRadius={130}
          stroke="var(--background)"
          strokeWidth={3}
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
  ),
};
