export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#151515',
        paper: '#f5f2ec',
        line: '#d8d2c7',
        accent: '#c84f31'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Impact', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
};
