/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        foreground: '#0F172A',
        card: '#FFFFFF',
        'card-border': '#E2E8F0',
        primary: '#4F46E5',
        'primary-shadow': '#4338CA',
        secondary: '#0D9488',
        accent: '#14B8A6',
        success: '#10B981',
        gold: '#F59E0B',
        muted: '#F1F5F9',
        'muted-foreground': '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
