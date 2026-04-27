import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
  args: { children: "alpha" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Outline: Story = { args: { variant: "outline" } };

export const All: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-center gap-3">
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
    </div>
  ),
};
