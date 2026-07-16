/**
 * Vyora design tokens as a Tailwind preset.
 *
 * Colours resolve to CSS variables defined in packages/ui/src/styles.css, so a
 * single set of utility classes themes both light and dark. The raw values
 * (ramps, semantics) live there; this file only names the utilities.
 *
 * Non-colour scales (spacing, radius, type, shadow) are transcribed from
 * design/README.md and the Design System spec.
 *
 * @type {import("tailwindcss").Config}
 */
const preset = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          content: "var(--color-primary-content)",
          tonal: "var(--color-primary-tonal)",
          "tonal-border": "var(--color-primary-tonal-border)",
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
          400: "var(--primary-400)",
          500: "var(--primary-500)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
          900: "var(--primary-900)",
        },
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
        },
        content: {
          DEFAULT: "var(--color-content)",
          muted: "var(--color-content-muted)",
        },
        band: {
          DEFAULT: "var(--color-band)",
          content: "var(--color-band-content)",
        },
        ring: "var(--color-ring)",
        success: {
          DEFAULT: "var(--color-success)",
          tonal: "var(--color-success-tonal)",
          border: "var(--color-success-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          tonal: "var(--color-warning-tonal)",
          border: "var(--color-warning-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          tonal: "var(--color-danger-tonal)",
          border: "var(--color-danger-border)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          tonal: "var(--color-info-tonal)",
          border: "var(--color-info-border)",
        },
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
      // Three soft cool shadows + focus ring.
      boxShadow: {
        rest: "var(--shadow-rest)",
        card: "var(--shadow-card)",
        overlay: "var(--shadow-overlay)",
        focus: "0 0 0 3px var(--color-ring)",
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
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "translate(-50%, -48%) scale(0.97)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 150ms ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default preset;
