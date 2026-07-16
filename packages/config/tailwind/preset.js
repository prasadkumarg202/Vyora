/**
 * Vyora design tokens as a Tailwind preset.
 *
 * Values are transcribed from `design/README.md` and the Design System spec.
 * The full 50–900 primary ramp and the semantic tonal bg/border variants live
 * in `Vyora Design System.dc.html` and land in packages/ui in Phase 4.
 *
 * @type {import("tailwindcss").Config}
 */
const preset = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "oklch(0.52 0.2 285)",
          hover: "oklch(0.44 0.2 285)",
          tonal: "oklch(0.96 0.025 285)",
        },
        canvas: "oklch(0.975 0.004 280)",
        surface: "#ffffff",
        border: {
          DEFAULT: "oklch(0.9 0.006 280)",
          subtle: "oklch(0.92 0.006 280)",
        },
        content: {
          DEFAULT: "oklch(0.24 0.02 280)",
          muted: "oklch(0.55 0.015 280)",
        },
        // Dark band behind headers.
        band: "oklch(0.22 0.03 280)",
        success: "oklch(0.6 0.14 155)",
        warning: "oklch(0.75 0.15 75)",
        danger: "oklch(0.58 0.2 25)",
        info: "oklch(0.6 0.14 235)",
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        // Numbers, codes, GSTIN/IMEI.
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        caption: ["11px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["13.5px", { lineHeight: "1.55" }],
        "body-lg": ["15px", { lineHeight: "1.6" }],
        h3: ["18px", { lineHeight: "1.35", fontWeight: "600" }],
        h2: ["23px", { lineHeight: "1.25", fontWeight: "650" }],
        h1: ["28px", { lineHeight: "1.2", fontWeight: "650" }],
        display: ["34px", { lineHeight: "1.14", fontWeight: "650" }],
      },
      // 4px base grid.
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        12: "48px",
        16: "64px",
      },
      borderRadius: {
        control: "6px",
        input: "10px",
        card: "14px",
        "card-lg": "16px",
        pill: "999px",
      },
      // Three soft cool shadows.
      boxShadow: {
        rest: "0 1px 2px rgba(40,32,90,0.06)",
        card: "0 6px 20px -14px rgba(40,32,90,0.2)",
        overlay: "0 20px 44px -20px rgba(40,32,90,0.4)",
        focus: "0 0 0 3px oklch(0.85 0.06 285)",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
      minHeight: {
        // Minimum touch target.
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default preset;
