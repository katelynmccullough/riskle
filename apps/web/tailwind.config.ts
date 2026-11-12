import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        riskle: {
          bg: '#111111',
          panel: '#1C1C1C',
          foreground: '#F5F5F5',
          accent: '#F4E65C',
          success: '#22C55E',
          error: '#EF4444',
        },
      },
      boxShadow: {
        glow: '0 0 18px rgba(244, 230, 92, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
