import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                ink:        '#0b1018',
                inkHi:      '#0e1420',
                surface:    'rgba(255,255,255,0.045)',
                surfaceHi:  'rgba(255,255,255,0.075)',
                hairline:   'rgba(255,255,255,0.09)',
                hairlineHi: 'rgba(255,255,255,0.16)',
                fg:        'rgba(255,255,255,0.95)',
                fgMuted:   'rgba(255,255,255,0.55)',
                fgDim:     'rgba(255,255,255,0.35)',

                emerald2:  '#10b981',
                amber2:    '#f59e0b',
                rose2:     '#ef4444',
                cyan2:     '#06b6d4',
                violet2:   '#8b5cf6',

                solar: {
                    50:  '#fff7ed',
                    100: '#ffedd5',
                    300: '#fdba74',
                    500: '#f97316',
                    600: '#ea580c',
                    700: '#c2410c',
                },
                good: '#10b981',
                bad:  '#ef4444',
                warn: '#f59e0b',
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
            },
            boxShadow: {
                'glow-emerald': '0 0 80px rgba(16,185,129,0.25), 0 0 24px rgba(16,185,129,0.18)',
                'glow-amber':   '0 0 80px rgba(245,158,11,0.25), 0 0 24px rgba(245,158,11,0.18)',
                'glow-rose':    '0 0 80px rgba(239,68,68,0.25),  0 0 24px rgba(239,68,68,0.18)',
                'glow-cyan':    '0 0 60px rgba(6,182,212,0.25)',
            },
        },
    },
    plugins: [],
};

export default config;
