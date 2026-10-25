/** KnightLend design tokens. UCF black and gold, functional green and red only. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: "#FFC904", hover: "#F0BC00", soft: "#FFF4C2" },
        ink: "#000000",
        paper: "#FFFFFF",
        mist: "#F5F5F5",
        line: "#E0E0E0",
        charcoal: "#333333",
        success: { DEFAULT: "#2E7D32", soft: "#E8F3E9" },
        danger: { DEFAULT: "#C62828", soft: "#FBEAEA" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: { card: "14px" },
      boxShadow: { card: "0 1px 2px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 0 0 / 0.04)" },
    },
  },
  plugins: [],
};
