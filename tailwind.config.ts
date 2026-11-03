import type { Config } from "tailwindcss";

// Design tokens from DESIGN.md (ShopVibe).
// Fuchsia "primary" is reserved for interactive elements only.
const config: Config = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./modules/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#D946EF",
          hover: "#C026D3",
          active: "#A21CAF",
          tint: "#FDF4FF",
        },
        secondary: "#22D3EE",
        tertiary: "#FACC15",
        background: "#FAFAFA",
        surface: "#FFFFFF",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        headline: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["56px", { lineHeight: "1.1", letterSpacing: "0.02em", fontWeight: "800" }],
        headline: ["40px", { lineHeight: "1.2", letterSpacing: "0.01em", fontWeight: "700" }],
        subhead: ["26px", { lineHeight: "1.3", letterSpacing: "0.005em", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6" }],
        body: ["16px", { lineHeight: "1.6" }],
        "body-sm": ["14px", { lineHeight: "1.5" }],
        caption: ["12px", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
        overline: ["11px", { lineHeight: "1.2", letterSpacing: "0.1em", fontWeight: "700" }],
      },
      borderRadius: {
        sm: "4px",
        md: "12px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        medium: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
        large: "0 10px 25px rgba(0,0,0,0.10), 0 6px 10px rgba(0,0,0,0.06)",
        overlay: "0 25px 50px rgba(0,0,0,0.15), 0 12px 24px rgba(0,0,0,0.08)",
        hover: "0 14px 32px rgba(217,70,239,0.12), 0 6px 12px rgba(0,0,0,0.06)",
        focus: "0 0 0 3px rgba(217,70,239,0.15)",
        "focus-error": "0 0 0 3px rgba(239,68,68,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
