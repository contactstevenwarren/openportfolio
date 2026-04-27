import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "./input";

const meta = {
  title: "Primitives/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: { placeholder: "AAPL" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="w-[280px]">
      <Input {...args} />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "Read-only" },
  render: (args) => (
    <div className="w-[280px]">
      <Input {...args} />
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <label className="flex w-[280px] flex-col gap-1.5">
      <span className="text-label">Symbol</span>
      <Input placeholder="AAPL" />
      <span className="text-body-sm text-muted-foreground">
        Ticker on the exchange (case-insensitive).
      </span>
    </label>
  ),
};
