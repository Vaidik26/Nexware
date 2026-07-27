/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#003527",
        secondary: "#006c49",
        background: "#f8f9ff",
        surface: "#ffffff",
        surfaceContainer: "#e5eeff",
        onSurface: "#0b1c30",
        error: "#ba1a1a",
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}
