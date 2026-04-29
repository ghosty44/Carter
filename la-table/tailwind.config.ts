import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        creme: {
          DEFAULT: '#FAF6F0',
          2: '#F2EBE0',
        },
        terra: {
          DEFAULT: '#C4714A',
          light: '#E8967A',
          dark:  '#9B4D2E',
        },
        sage: {
          DEFAULT: '#7A8C6E',
          light:   '#B5C4A6',
        },
        ink: {
          DEFAULT: '#2A2118',
          light:   '#6B5B4E',
        },
        gold: '#D4A853',
      },
      fontFamily: {
        display: ["'Playfair Display'", 'Georgia', 'serif'],
        sans:    ["'DM Sans'", 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '18px',
      },
    },
  },
  plugins: [],
}

export default config
