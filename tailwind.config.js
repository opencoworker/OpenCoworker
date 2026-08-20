/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#14161a',
        slate: '#5b6470',
        signal: '#2b5cff',
        amber: '#b5730a',
        surface: '#f7f8f9'
      }
    }
  },
  plugins: []
}
