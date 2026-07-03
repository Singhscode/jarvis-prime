import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep-space base palette
        surface: {
          DEFAULT: "#030712",
          50: "#0a0f1e",
          100: "#111827",
          200: "#1e293b",
          300: "#293548",
        },
        // Vivid accent palette
        accent: {
          cyan: "#06B6D4",
          violet: "#8B5CF6",
          fuchsia: "#D946EF",
          blue: "#3B82F6",
        },
        // Legacy compat
        cyan: {
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",
          600: "#0891B2",
        },
        purple: {
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
        },
        slate: {
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#030712",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "hero-mesh":
          "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(139,92,246,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 50%, rgba(6,182,212,0.1) 0%, transparent 60%)",
        "glow-conic":
          "conic-gradient(from 180deg at 50% 50%, #06B6D4 0deg, #8B5CF6 120deg, #D946EF 240deg, #06B6D4 360deg)",
      },
      animation: {
        "fade-in": "fadeIn 0.8s ease-out forwards",
        "slide-up": "slideUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-down": "slideDown 0.3s ease-out forwards",
        "scale-in": "scaleIn 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "float-slower": "float 12s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "border-spin": "borderSpin 4s linear infinite",
        "orb-drift": "orbDrift 20s ease-in-out infinite",
        "orb-drift-2": "orbDrift2 25s ease-in-out infinite",
        "grid-fade": "gridFade 3s ease-in-out infinite",
        "text-reveal": "textReveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        glowPulse: {
          "0%, 100%": {
            boxShadow:
              "0 0 20px rgba(6,182,212,0.3), 0 0 60px rgba(139,92,246,0.1)",
          },
          "50%": {
            boxShadow:
              "0 0 40px rgba(6,182,212,0.5), 0 0 80px rgba(139,92,246,0.2)",
          },
        },
        borderSpin: {
          "0%": { "--border-angle": "0deg" },
          "100%": { "--border-angle": "360deg" },
        },
        orbDrift: {
          "0%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.05)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.95)" },
          "100%": { transform: "translate(0, 0) scale(1)" },
        },
        orbDrift2: {
          "0%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-40px, 30px) scale(0.95)" },
          "66%": { transform: "translate(25px, -40px) scale(1.05)" },
          "100%": { transform: "translate(0, 0) scale(1)" },
        },
        gridFade: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        textReveal: {
          "0%": { opacity: "0", transform: "translateY(20px)", filter: "blur(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
