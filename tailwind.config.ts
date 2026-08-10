import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        admira: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#2952e3",
          600: "#1f3fc4",
          700: "#1a339e",
          900: "#111d5e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
