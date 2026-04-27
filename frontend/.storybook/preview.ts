import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";

import "../app/globals.css";
import "./storybook.css";

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    layout: "centered",
  },
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
  ],
};

export default preview;
