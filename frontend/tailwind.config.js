/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        th: {
          base: "var(--bg-base)",
          card: "var(--bg-card)",
          "card-hover": "var(--bg-card-hover)",
          surface: "var(--bg-surface)",
          "surface-alt": "var(--bg-surface-alt)",
          border: "var(--border)",
          "border-strong": "var(--border-strong)",
        },
      },
      textColor: {
        th: {
          heading: "var(--text-heading)",
          body: "var(--text-body)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
      },
      borderColor: {
        th: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
      },
    },
  },
  plugins: [],
};
