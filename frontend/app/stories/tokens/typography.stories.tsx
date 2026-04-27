import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Tokens/Typography",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const scale = [
  { token: "text-display", desc: "40 / 48 · Inter 700", sample: "Display" },
  { token: "text-h1", desc: "28 / 36 · Inter 600", sample: "Heading 1" },
  { token: "text-h2", desc: "22 / 30 · Inter 600", sample: "Heading 2" },
  { token: "text-h3", desc: "18 / 26 · Inter 600", sample: "Heading 3" },
  {
    token: "text-body",
    desc: "16 / 24 · Inter 400",
    sample:
      "Default body text. Holdings updated Apr 12, 2026 — fund compositions from SEC N-PORT, Q4 2025.",
  },
  {
    token: "text-body-sm",
    desc: "14 / 20 · Inter 400",
    sample:
      "Secondary metadata, table captions, dense lists, tooltip body.",
  },
  { token: "text-label", desc: "13 / 18 · Inter 500", sample: "Form label" },
  {
    token: "text-mono",
    desc: "15 / 20 · JBM 400",
    sample: "847,392.41",
    mono: true,
  },
  {
    token: "text-mono-sm",
    desc: "13 / 18 · JBM 400",
    sample: "AAPL · 124.50",
    mono: true,
  },
];

export const Scale: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-6">
      {scale.map((t) => (
        <div
          key={t.token}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]"
        >
          <div className="text-mono-sm text-muted-foreground">
            <div>{t.token}</div>
            <div>{t.desc}</div>
          </div>
          <div className={`${t.token} ${t.mono ? "font-mono" : "font-sans"}`}>
            {t.sample}
          </div>
        </div>
      ))}
    </div>
  ),
};
