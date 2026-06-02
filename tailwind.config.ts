import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        muted: "#667085",
        line: "#d9e2ec",
        panel: "#f8fafc",
        accent: "#0f766e",
        warn: "#b45309",
        danger: "#b42318"
      }
    }
  },
  plugins: []
};

export default config;
