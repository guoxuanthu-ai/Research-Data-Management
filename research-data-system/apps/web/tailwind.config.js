/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/shared/src/**/*.ts'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#effaf5', 100: '#d9f2e5', 200: '#b6e4ce', 300: '#85cfb0', 400: '#4fb38e', 500: '#2c9873', 600: '#1d7b5c', 700: '#17624b', 800: '#144e3d', 900: '#123f33', 950: '#08241d' },
        ink: { 50: '#f6f7f7', 100: '#e2e5e4', 200: '#c5cbc9', 300: '#a0aaa7', 400: '#7b8783', 500: '#606c68', 600: '#4c5653', 700: '#3f4744', 800: '#353c3a', 900: '#2f3533', 950: '#181c1b' },
        canvas: '#f4f6f5',
        warning: { 50: '#fff9eb', 500: '#e79b22', 700: '#a96208' },
        danger: { 50: '#fff1f1', 500: '#df4b4b', 700: '#b42323' },
      },
      fontFamily: { sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(18, 63, 51, 0.03), 0 8px 30px rgba(18, 63, 51, 0.04)', lift: '0 16px 40px rgba(18, 63, 51, 0.12)' },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
      minHeight: { touch: '44px' },
    },
  },
  plugins: [],
};
