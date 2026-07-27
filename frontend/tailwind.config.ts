/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#003527',
        secondary: '#006c49',
        'primary-container': '#064e3b',
        'on-primary-container': '#80bea6',
        background: '#f8f9ff',
        surface: '#f8f9ff',
        'surface-container': '#e5eeff',
        'surface-container-lowest': '#ffffff',
        'on-surface': '#0b1c30',
        'on-surface-variant': '#404944',
        'outline-variant': '#bfc9c3',
        error: '#ba1a1a',
        'secondary-container': '#6cf8bb',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
