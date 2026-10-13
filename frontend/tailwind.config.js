/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "navy" / "cyber" are the original token names from the app's first
        // (blue) theme. Repointed here to the charcoal/ember industrial SOC
        // palette — kept as-is rather than renamed so every existing
        // `bg-navy-900` / `text-cyber-blue` class across the app picks up the
        // new look automatically, with zero risk of a missed rename silently
        // leaving some element unstyled.
        navy: {
          950: '#0c0e10', // canvas
          900: '#121415', // panel
          800: '#1e2022', // tray / hover
          700: '#282a2c', // hairline border
          600: '#37393b', // bevel / disabled ring
        },
        cyber: {
          blue: '#f9500c',  // primary action / active nav / brand (was blue, now ember)
          cyan: '#ff7336',  // secondary / in-progress accent (was cyan, now ember-light)
          green: '#10b981', // success — unchanged
          red: '#ef4444',   // danger — unchanged
          amber: '#f59e0b', // warning — unchanged
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(249,80,12,0.3), 0 8px 30px rgba(249,80,12,0.15)',
      },
    },
  },
  plugins: [],
}
