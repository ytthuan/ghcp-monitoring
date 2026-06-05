// Tailwind v4 uses CSS-first config. This file is intentionally minimal;
// theme tokens live in app/styles/globals.css via @theme.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
};
export default config;
