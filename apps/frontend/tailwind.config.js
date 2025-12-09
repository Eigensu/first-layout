/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "475px", // Extra small devices
      },
      colors: {
        // Backgrounds: classes like bg-bg-body, bg-bg-card
        bg: {
          body: "var(--bg-body)",
          elevated: "var(--bg-elevated)",
          card: "var(--bg-card)",
          "card-soft": "var(--bg-card-soft)",
          chip: "var(--bg-chip)",
        },

        // Accents: text-accent-pink-500, bg-accent-orange-soft, etc.
        accent: {
          pink: {
            50: "var(--accent-pink-faint)",
            soft: "var(--accent-pink-soft)",
            500: "var(--accent-pink)",
            deep: "var(--accent-pink-deep)",
          },
          orange: {
            50: "var(--accent-orange-faint)",
            soft: "var(--accent-orange-soft)",
            500: "var(--accent-orange)",
            deep: "var(--accent-orange-deep)",
          },
        },

        text: {
          main: "var(--text-main)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },

        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },

        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",

        // Legacy support - map old primary colors to new system
        primary: {
          50: "var(--accent-pink-faint)",
          100: "var(--bg-card)",
          200: "var(--bg-card-soft)",
          300: "var(--bg-chip)",
          400: "var(--accent-pink-soft)",
          500: "var(--accent-pink)",
          600: "var(--accent-pink)",
          700: "var(--accent-pink-deep)",
          800: "var(--accent-pink-deep)",
          900: "var(--bg-elevated)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ["Poppins", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "28px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["36px", { lineHeight: "40px" }],
        "5xl": ["48px", { lineHeight: "1" }],
        "6xl": ["60px", { lineHeight: "1" }],
        "7xl": ["72px", { lineHeight: "1" }],
      },
      spacing: {
        18: "4.5rem",
        88: "22rem",
        128: "32rem",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        soft: "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)",
        medium:
          "0 4px 25px -2px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        large:
          "0 10px 40px -4px rgba(0, 0, 0, 0.1), 0 4px 25px -5px rgba(0, 0, 0, 0.1)",
        "pink-soft": "var(--shadow-soft-pink)",
        "pink-strong": "var(--shadow-strong-pink)",
        glow: "0 0 20px rgba(202, 57, 133, 0.3)",
        "glow-lg": "0 0 40px rgba(202, 57, 133, 0.25)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-hero": "var(--gradient-hero)",
        "gradient-brand": "var(--gradient-brand)",
        "gradient-card": "var(--gradient-card)",
        "gradient-button-primary": "var(--gradient-button-primary)",
        "gradient-button-secondary": "var(--gradient-button-secondary)",
        "gradient-primary": "var(--gradient-brand)",
        "gradient-secondary": "var(--gradient-button-secondary)",
        glass:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "bounce-soft": "bounceSoft 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        bounceSoft: {
          "0%, 20%, 50%, 80%, 100%": { transform: "translateY(0)" },
          "40%": { transform: "translateY(-4px)" },
          "60%": { transform: "translateY(-2px)" },
        },
      },
    },
  },
  plugins: [],
};
