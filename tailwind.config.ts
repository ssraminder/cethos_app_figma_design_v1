import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        jakarta: ["Plus Jakarta Sans", "sans-serif"],
      },
      colors: {
        // === CETHOS BRAND COLORS ===
        cethos: {
          navy: "#0C2340", // Primary heading color
          blue: "hsl(var(--cethos-blue))", // Keep existing for compatibility
          teal: {
            DEFAULT: "#0891B2", // Primary brand color (replaces blue)
            light: "#06B6D4", // Hover state
            50: "#ECFEFF", // Very light background
            100: "#CFFAFE", // Light background
            500: "#06B6D4", // Standard teal
            600: "#0891B2", // Default teal
            700: "#0E7490", // Dark teal
          },
          gray: {
            DEFAULT: "#4B5563", // Body text
            light: "#717182", // Secondary text
          },
          "slate-dark": "hsl(var(--cethos-slate-dark))",
          slate: "hsl(var(--cethos-slate))",
          "slate-light": "hsl(var(--cethos-slate-light))",
          border: "#E5E7EB", // Border color
          bg: {
            DEFAULT: "hsl(var(--cethos-bg))",
            light: "#F8FAFC", // Light background
            blue: "#E0F2FE", // Blue tint background
          },
          "bg-alt": "hsl(var(--cethos-bg-alt))",
          "text-muted": "#64748B", // Muted text
          "text-placeholder": "#94A3B8", // Placeholder text
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "cethos-card": "0 4px 6px rgba(0, 0, 0, 0.05)",
        "cethos-card-hover": "0 10px 25px rgba(0, 0, 0, 0.1)",
        "cethos-soft":
          "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
        "cethos-focus": "0 0 0 3px rgba(8, 145, 178, 0.2)",
        "cethos-focus-error": "0 0 0 3px rgba(239, 68, 68, 0.2)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
