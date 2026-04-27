import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Tokens/Radii",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const radii = [
  { name: "none", value: "0", className: "rounded-none" },
  { name: "sm", value: "4px", className: "rounded-sm" },
  { name: "md", value: "8px", className: "rounded-md" },
  { name: "lg", value: "12px", className: "rounded-lg" },
  { name: "pill", value: "9999px", className: "rounded-full" },
];

export const Scale: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {radii.map((r) => (
        <div key={r.name} className="flex flex-col items-center gap-2">
          <div className={`bg-muted h-20 w-20 ${r.className}`} aria-hidden />
          <span className="text-mono-sm text-muted-foreground">
            {r.name} · {r.value}
          </span>
        </div>
      ))}
    </div>
  ),
};
