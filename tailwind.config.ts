import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,html}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          sunken: 'var(--bg-sunken)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          link: 'var(--text-link)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)'
        }
      },
      fontFamily: {
        display: ['Lora', 'Georgia', 'Times New Roman', 'serif'],
        ui: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Courier New', 'monospace']
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px'
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        md: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)'
      }
    }
  },
  plugins: []
};

export default config;
