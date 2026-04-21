import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      fontSize: {
        hero: ["clamp(2.25rem,6vw,3.75rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        display: ["clamp(1.875rem,4vw,2.75rem)", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
      },
      colors: {
        /** Primary text on dark */
        ink: { DEFAULT: "#ebe7f5", muted: "#9d94b8" },
        /** Surfaces (dark-first “parchment” tokens) */
        parchment: { DEFAULT: "#080510", deep: "#141022" },
        /** Violet accent + glow */
        accent: { DEFAULT: "#8b5cf6", light: "#a78bfa", dim: "#6d28d9" },
        mystic: {
          void: "#030108",
          purple: "#1a0a2e",
          edge: "#2e1065",
        },
      },
      boxShadow: {
        glow: "0 0 32px rgba(139, 92, 246, 0.22), 0 0 64px rgba(139, 92, 246, 0.08)",
        "glow-sm": "0 0 20px rgba(167, 139, 250, 0.18)",
        "glow-lg": "0 0 48px rgba(139, 92, 246, 0.18), 0 0 96px rgba(91, 33, 182, 0.12)",
        "glow-soft": "0 0 60px rgba(124, 58, 237, 0.14), 0 8px 40px rgba(0,0,0,0.5)",
        "glow-inset": "inset 0 1px 0 rgba(255,255,255,0.06)",
        surface: "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(139, 92, 246, 0.12)",
      },
      transitionDuration: {
        layout: "320ms",
        immersive: "480ms",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "gradient-flow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "glow-breathe": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "0.95" },
        },
      },
      animation: {
        "gradient-flow": "gradient-flow 20s ease infinite",
        "glow-breathe": "glow-breathe 5s ease-in-out infinite",
      },
      backgroundSize: {
        "gradient-xl": "200% 200%",
      },
    },
  },
  plugins: [],
};

export default config;
