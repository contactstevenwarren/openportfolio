import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Tokens/Shadows",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const shadows = [
  { name: "0", className: "shadow-none", value: "none", use: "Default" },
  { name: "1", className: "shadow-1", value: "0 1px 2px rgba(0,0,0,0.04)", use: "Row separation" },
  { name: "2", className: "shadow-2", value: "0 4px 12px rgba(0,0,0,0.06)", use: "Cards, popovers" },
  { name: "3", className: "shadow-3", value: "0 12px 32px rgba(0,0,0,0.10)", use: "Modals, dropdowns" },
];

export const Scale: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8">
      {shadows.map((s) => (
        <div key={s.name} className="flex flex-col items-center gap-3">
          <div
            className={`bg-background flex h-24 w-32 items-center justify-center rounded-md ${s.className}`}
          >
            <span className="text-mono-sm text-muted-foreground">
              shadow-{s.name}
            </span>
          </div>
          <div className="text-body-sm text-muted-foreground max-w-[180px] text-center">
            {s.use}
          </div>
        </div>
      ))}
    </div>
  ),
};
