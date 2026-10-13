/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App-shell neutrals (light canvas + white cards), matching the
        // design in github.com/pratham-vd/phishguard-frontend's styles.css.
        // Kept under the original "navy" name so every existing `bg-navy-900`
        // class across the app picks up the new look with zero renames.
        navy: {
          950: '#f6f7f9', // app background (near-white)
          900: '#ffffff', // card / panel surface
          800: '#eef1f4', // muted surface / hover
          700: '#e3e6eb', // hairline border
          600: '#c7cdd6', // input border / ring
        },
        // Brand accent — teal, matching the mockup's --primary / --sidebar-primary.
        cyber: {
          blue: '#0f766e',   // primary action / active nav / brand
          cyan: '#14b8a6',   // secondary accent / links / in-progress
          green: '#15803d',  // success — matches mockup's --success
          red: '#dc2626',    // danger — matches mockup's --destructive
          amber: '#d97706',  // warning — matches mockup's --warning
        },
        // Dedicated dark sidebar palette (distinct from the light "navy"
        // scale above — his design uses a dark sidebar over a light canvas).
        sidebar: {
          DEFAULT: '#1a2233',
          foreground: '#e8edf5',
          primary: '#14b8a6',
          'primary-foreground': '#0b1f23',
          accent: '#283046',
          border: 'rgba(255,255,255,0.09)',
        },
        foreground: '#1e293b',
        'muted-foreground': '#64748b',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['Manrope', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(15,118,110,0.25), 0 8px 24px rgba(15,118,110,0.12)',
      },
    },
  },
  plugins: [],
}
