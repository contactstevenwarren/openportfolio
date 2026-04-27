import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Primitives/Card",
  component: Card,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Holdings updated</CardTitle>
        <CardDescription>Apr 12, 2026 · from Fidelity CSV</CardDescription>
      </CardHeader>
      <CardContent className="text-body-sm text-muted-foreground">
        12 positions, $847,392.41 total. Three classifications were inferred and
        await your review.
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline">Skip</Button>
        <Button>Review</Button>
      </CardFooter>
    </Card>
  ),
};

export const HeroNumber: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardDescription>Total portfolio value</CardDescription>
        <CardTitle className="text-display text-accent font-mono font-medium">
          $847,392
        </CardTitle>
      </CardHeader>
      <CardContent className="text-body-sm text-muted-foreground">
        ▲ +$1,204 today · ▲ +12.4% YTD
      </CardContent>
    </Card>
  ),
};
