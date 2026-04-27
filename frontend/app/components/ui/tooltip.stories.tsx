import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>Holdings updated Apr 12, 2026</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

export const Provenance: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="text-mono text-accent font-medium underline decoration-dotted underline-offset-4">
          $847,392
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px]">
          <p className="text-body-sm">Total portfolio value</p>
          <p className="text-body-sm text-muted-foreground mt-1">
            Holdings updated Apr 12, 2026 · 12 positions across 3 accounts
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
