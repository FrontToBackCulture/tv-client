/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core theme colors (CSS variable based)
        background: 'var(--background)',
        foreground: 'var(--foreground)',

        // Override Tailwind's slate palette with Morningstar warm neutrals
        slate: {
          50: '#F6F5F4',
          100: '#ECEBEA',
          200: '#DAD9D8',
          300: '#BDBCBA',
          400: '#9E9C9B',
          500: '#7F7D7A',
          600: '#64625F',
          700: '#4E4C4A',
          800: '#3D3B39',
          900: '#2C2B2A',
          950: '#1A1918',
        },

        // Brand colors - Navy primary, Morningstar-aligned palette
        brand: {
          primary: '#1E3A5F',
          'primary-light': '#2364B9',
          'primary-dark': '#0F3D7C',
          secondary: '#64625F',
          accent: '#0D7D85',
        },

        // Text colors (Morningstar warm neutrals)
        text: {
          primary: '#2C2B2A',
          secondary: '#64625F',
          muted: '#9E9C9B',
          inverse: '#FFFFFF',
        },

        // Neutral palette (Morningstar 0-100 scale)
        neutral: {
          0: '#FFFFFF',
          5: '#F6F5F4',
          10: '#ECEBEA',
          15: '#DAD9D8',
          20: '#BDBCBA',
          30: '#9E9C9B',
          40: '#7F7D7A',
          50: '#64625F',
          60: '#4E4C4A',
          70: '#3D3B39',
          80: '#2C2B2A',
          90: '#1A1918',
          100: '#000000',
        },

        // Background layers
        bg: {
          page: '#F6F5F4',
          surface: '#FFFFFF',
          elevated: '#FFFFFF',
          muted: '#ECEBEA',
        },

        // Border colors
        'border-light': '#DAD9D8',
        'border-medium': '#BDBCBA',

        // Semantic colors with CSS variable support for dark mode
        border: 'var(--border)',
        accent: 'var(--accent)',

        // Status colors with light backgrounds
        success: {
          DEFAULT: 'var(--color-success)',
          light: 'var(--color-success-light)',
          dark: 'var(--color-success-dark)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          light: 'var(--color-error-light)',
          dark: 'var(--color-error-dark)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          light: 'var(--color-warning-light)',
          dark: 'var(--color-warning-dark)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          light: 'var(--color-info-light)',
          dark: 'var(--color-info-dark)',
        },

        // Additional Morningstar color ramps
        orange: {
          DEFAULT: 'var(--color-orange)',
          light: 'var(--color-orange-light)',
          dark: 'var(--color-orange-dark)',
        },
        teal: {
          DEFAULT: 'var(--color-teal)',
          light: 'var(--color-teal-light)',
          dark: 'var(--color-teal-dark)',
        },
        purple: {
          DEFAULT: 'var(--color-purple)',
          light: 'var(--color-purple-light)',
          dark: 'var(--color-purple-dark)',
        },
        magenta: {
          DEFAULT: 'var(--color-magenta)',
          light: 'var(--color-magenta-light)',
          dark: 'var(--color-magenta-dark)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
