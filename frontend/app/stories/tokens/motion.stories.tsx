"use client";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

const meta = {
  title: "Tokens/Motion",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const tokens = [
  { name: "fast", duration: "120ms", use: "Tooltips, hover" },
  { name: "medium", duration: "200ms", use: "Panels, modals, theme toggle" },
  { name: "slow", duration: "300ms", use: "Donut drill-down" },
  { name: "chart", duration: "400ms", use: "Chart re-render with new data" },
];

function MotionRow({ name, duration, use }: { name: string; duration: string; use: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="flex items-center gap-6 border-b py-3">
      <div className="w-32">
        <div className="text-body-sm font-medium">{name}</div>
        <div className="text-mono-sm text-muted-foreground">{duration}</div>
      </div>
      <div className="text-body-sm text-muted-foreground flex-1">{use}</div>
      <button
        type="button"
        onClick={() => setOn((x) => !x)}
        className="bg-muted hover:bg-muted/80 text-body-sm rounded-md px-3 py-1.5 font-medium transition-colors"
      >
        Toggle
      </button>
      <div
        className="bg-accent h-8 rounded-md"
        style={{
          width: on ? 120 : 8,
          transitionProperty: "width",
          transitionDuration: duration,
          transitionTimingFunction: on ? "var(--ease-out)" : "var(--ease-in)",
        }}
        aria-hidden
      />
    </div>
  );
}

export const Durations: Story = {
  render: () => (
    <div className="max-w-2xl">
      <p className="text-body-sm text-muted-foreground mb-4">
        Reserved and functional. All transitions collapse to 0ms when{" "}
        <code>prefers-reduced-motion: reduce</code> is set.
      </p>
      {tokens.map((t) => (
        <MotionRow key={t.name} {...t} />
      ))}
    </div>
  ),
};
