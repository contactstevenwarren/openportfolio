import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: [
    "../app/components/**/*.stories.@(ts|tsx)",
    "../app/stories/**/*.stories.@(ts|tsx|mdx)",
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes"],
  staticDirs: ["../public"],
  typescript: {
    check: false,
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
