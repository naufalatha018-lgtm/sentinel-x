/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#F4F7FB',
          dark: '#090D16',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#111827',
        },
        cobalt: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          900: '#1E3A8A',
        },
        navy: {
          950: '#090D16',
          900: '#0F172A',
          800: '#1E293B',
        },
      },
      fontFamily: {
        sans:  ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono:  ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'card':      '0 1px 4px -1px rgba(15,23,42,0.06), 0 2px 12px -2px rgba(15,23,42,0.04)',
        'card-dark': '0 2px 12px -2px rgba(0,0,0,0.5)',
        'cobalt':    '0 8px 24px -4px rgba(37,99,235,0.3)',
        'monitor':   '0 20px 50px -10px rgba(0,0,0,0.6)',
      },
      screens: {
        'xs': '375px',
      },
      maxWidth: {
        '8xl': '1440px',
      },
    },
  },
  plugins: [],
}
