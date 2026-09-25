import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          solid: "hsl(var(--primary-solid))",
          text: "hsl(var(--primary-text))",
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
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
        "surface-subtle": "hsl(var(--surface-subtle))",
        track: "hsl(var(--track))",
        "ink-strong": "hsl(var(--ink-strong))",
        "subtle-foreground": "hsl(var(--subtle-foreground))",
        chitra: {
          DEFAULT: "hsl(var(--chitra))",
          bg: "hsl(var(--chitra-bg))",
          warning: "hsl(var(--chitra-warning))",
          "warning-bg": "hsl(var(--chitra-warning-bg))",
          praise: "hsl(var(--chitra-praise))",
          "praise-bg": "hsl(var(--chitra-praise-bg))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          muted: "hsl(var(--chart-muted))",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        kpi: ["2rem", { lineHeight: "1", fontWeight: "500", letterSpacing: "-0.02em" }],
        "title-lg": ["1.5rem", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "-0.015em" }],
        title: ["1.125rem", { lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.01em" }],
        body: ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-lg": ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        label: ["0.8125rem", { lineHeight: "1.4", fontWeight: "500" }],
        caption: ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-xl)",
        xs: "var(--radius-xs)",
        "3xl": "var(--radius-3xl)",
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        "elev-1": "var(--shadow-1)",
        "elev-2": "var(--shadow-2)",
        border: "var(--shadow-border)",
        "border-hover": "var(--shadow-border-hover)",
        popover: "var(--shadow-popover)",
        overlay: "var(--shadow-overlay)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        drawer: "var(--ease-drawer)",
        icon: "var(--ease-icon)",
      },
      transitionDuration: {
        instant: "var(--dur-instant)",
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
        tooltip: "var(--dur-tooltip)",
        chart: "var(--dur-chart)",
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
        "radar-ring": {
          "0%": { transform: "scale(0.75)", opacity: "0.5" },
          "70%": { transform: "scale(1.45)", opacity: "0" },
          "100%": { transform: "scale(1.45)", opacity: "0" },
        },
        "radar-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.65" },
        },
        "enter-up": {
          from: { opacity: "0", transform: "translateY(12px)", filter: "blur(4px)" },
          to: { opacity: "1", transform: "none", filter: "none" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "radar-ring": "radar-ring 2.4s ease-out infinite",
        "radar-soft": "radar-soft 2.4s ease-in-out infinite",
        "enter-up": "enter-up var(--dur-slow) var(--ease-out) both",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
