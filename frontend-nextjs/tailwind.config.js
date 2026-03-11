/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bliss:  '#E8D0D0',
        chill:  '#AED9DA',
        coral:  '#3DDAD8',
        bondi:  '#2A93D5',
        marina: '#135589',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'bounce-dot': 'bounceDot 1.2s ease-in-out infinite',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathe': 'breathe 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        bounceDot: {
          '0%,80%,100%': { transform: 'scale(0)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.82)', opacity: '0.55' },
          '50%':      { transform: 'scale(1.08)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
