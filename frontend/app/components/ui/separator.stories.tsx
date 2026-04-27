import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Separator } from "./separator";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-[300px]">
      <p className="text-body-sm">Holdings updated Apr 12, 2026</p>
      <Separator className="my-3" />
      <p className="text-body-sm text-muted-foreground">
        Fund compositions from SEC N-PORT, Q4 2025
      </p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3">
      <span className="text-body-sm">$847,392</span>
      <Separator orientation="vertical" />
      <span className="text-body-sm text-muted-foreground">
        ▲ +1.2% today
      </span>
    </div>
  ),
};
