import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        heading: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          fg: "hsl(var(--success-fg))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          fg: "hsl(var(--warning-fg))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          fg: "hsl(var(--danger-fg))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          fg: "hsl(var(--info-fg))",
        },
        "subject-1": {
          DEFAULT: "hsl(var(--subject-1))",
          fg: "hsl(var(--subject-1-fg))",
        },
        "subject-2": {
          DEFAULT: "hsl(var(--subject-2))",
          fg: "hsl(var(--subject-2-fg))",
        },
        "subject-3": {
          DEFAULT: "hsl(var(--subject-3))",
          fg: "hsl(var(--subject-3-fg))",
        },
        "subject-4": {
          DEFAULT: "hsl(var(--subject-4))",
          fg: "hsl(var(--subject-4-fg))",
        },
        "subject-5": {
          DEFAULT: "hsl(var(--subject-5))",
          fg: "hsl(var(--subject-5-fg))",
        },
        "subject-6": {
          DEFAULT: "hsl(var(--subject-6))",
          fg: "hsl(var(--subject-6-fg))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
