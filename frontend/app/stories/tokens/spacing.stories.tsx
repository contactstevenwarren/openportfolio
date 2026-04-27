import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Tokens/Spacing",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const scale = [4, 8, 12, 16, 24, 32, 48, 64, 96];

export const Scale: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <p className="text-body-sm text-muted-foreground max-w-xl">
        4px base. Tailwind v4&rsquo;s default scale matches OpenPortfolio brand
        exactly. Use the corresponding utility (<code>p-4</code> = 16px,{" "}
        <code>gap-6</code> = 24px, etc.).
      </p>
      <div className="flex items-end gap-4">
        {scale.map((px) => (
          <div key={px} className="flex flex-col items-center gap-2">
            <div
              className="bg-foreground"
              style={{ width: 4, height: px }}
              aria-hidden
            />
            <span className="text-mono-sm text-muted-foreground">{px}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};
