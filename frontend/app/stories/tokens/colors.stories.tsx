import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Tokens/Colors",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const semantic: Array<{ name: string; cssVar: string; use: string }> = [
  { name: "background", cssVar: "--background", use: "Page bg" },
  { name: "foreground", cssVar: "--foreground", use: "Primary text" },
  { name: "primary", cssVar: "--primary", use: "Default buttons" },
  { name: "primary-foreground", cssVar: "--primary-foreground", use: "Text on primary" },
  { name: "muted", cssVar: "--muted", use: "Cards, sections" },
  { name: "muted-foreground", cssVar: "--muted-foreground", use: "Secondary text" },
  { name: "border", cssVar: "--border", use: "Dividers" },
  { name: "accent", cssVar: "--accent", use: "Accent · sparingly" },
  { name: "accent-foreground", cssVar: "--accent-foreground", use: "Text on accent" },
  { name: "accent-soft", cssVar: "--accent-soft", use: "Focus ring" },
  { name: "success", cssVar: "--success", use: "Gains" },
  { name: "success-soft", cssVar: "--success-soft", use: "Pill bg" },
  { name: "warning", cssVar: "--warning", use: "Warnings" },
  { name: "warning-soft", cssVar: "--warning-soft", use: "Pill bg" },
  { name: "destructive", cssVar: "--destructive", use: "Losses" },
  { name: "destructive-soft", cssVar: "--destructive-soft", use: "Pill bg" },
];

const viz = [
  "viz-cash",
  "viz-us-equity",
  "viz-intl-equity",
  "viz-fixed-income",
  "viz-real-estate",
  "viz-crypto",
  "viz-alts",
  "viz-other",
];

function Swatch({ name, cssVar, use }: { name: string; cssVar: string; use?: string }) {
  return (
    <div className="bg-card text-card-foreground flex items-center gap-3 rounded-md border p-3">
      <span
        className="border-border h-12 w-12 shrink-0 rounded-md border"
        style={{ background: `var(${cssVar})` }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm font-medium">{name}</span>
        <span className="text-mono-sm text-muted-foreground truncate">
          {cssVar}
        </span>
      </div>
      {use ? (
        <span className="text-body-sm text-muted-foreground">{use}</span>
      ) : null}
    </div>
  );
}

export const Semantic: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {semantic.map((c) => (
        <Swatch key={c.name} {...c} />
      ))}
    </div>
  ),
};

export const Viz: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {viz.map((name) => (
        <Swatch key={name} name={name} cssVar={`--${name}`} />
      ))}
    </div>
  ),
};

export const Chart: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <Swatch key={n} name={`chart-${n}`} cssVar={`--chart-${n}`} />
      ))}
    </div>
  ),
};
