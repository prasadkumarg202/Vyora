import type { Config } from "tailwindcss";
import preset from "@vyora/config/tailwind";

export default {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    // Scan the design system package so its classes survive purging.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
