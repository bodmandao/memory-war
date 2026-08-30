import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#0a0d12",
        deep: "#06080b",
        surface: "#12161d",
        "surface-raised": "#171c25",
        "surface-2": "#1c2230",
        line: "#232833",
        "line-soft": "#1a1f28",
        ink: "#e8ebf0",
        "ink-dim": "#8891a3",
        "ink-faint": "#5b6472",
        accent: "#3ed6b5",
        "accent-dim": "#1f5f52",
        "accent-soft": "#0f2620",
        // secondary hue reserved for causality / network-structure motifs
        // (ProtocolFlow connectors, ambient hero geometry) — never used for
        // status/semantic meaning, so it can't be confused with a verdict.
        signal: "#7c8cf8",
        "signal-dim": "#33396e",
        "signal-soft": "#151a33",
        true_: "#4ade80",
        false_: "#f87171",
        contested: "#fbbf24",
        superseded: "#8891a3",
      },
      fontFamily: {
        display: ["var(--font-bricolage)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        sans: ["var(--font-plex-sans)", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      maxWidth: {
        content: "1180px",
      },
      boxShadow: {
        "glow-accent": "0 0 0 1px rgba(62,214,181,0.18), 0 0 28px -6px rgba(62,214,181,0.45)",
        "glow-signal": "0 0 0 1px rgba(124,140,248,0.18), 0 0 28px -6px rgba(124,140,248,0.4)",
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 12px 32px -20px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgba(232,235,240,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,235,240,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-dot": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        drift: { from: { transform: "translate3d(0,0,0)" }, to: { transform: "translate3d(-40px,-40px,0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out",
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
        drift: "drift 26s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
