/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        surface2: v('surface2'),
        border: v('border'),
        ink: v('text'),
        muted: v('muted'),
        faint: v('faint'),
        primary: v('primary'),
        cyan: v('cyan'),
        warning: v('warning'),
        danger: v('danger'),
        success: v('success'),
      },
      borderRadius: { card: '22px', xl2: '28px' },
    },
  },
  plugins: [],
};
