/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './pages/**/*.html', './pages/**/*.js', './public/**/*.js'],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#0a0a0a',
        card: '#ffffff',
        'card-foreground': '#0a0a0a',
        popover: '#ffffff',
        'popover-foreground': '#0a0a0a',
        primary: '#0aa7a0',
        'primary-foreground': '#ffffff',
        secondary: '#f5f5f5',
        'secondary-foreground': '#171717',
        muted: '#f5f5f5',
        'muted-foreground': '#737373',
        accent: '#e6f6f5',
        'accent-foreground': '#0b6b64',
        destructive: '#ef4444',
        'destructive-foreground': '#fafafa',
        border: '#e5e5e5',
        input: '#e5e5e5',
        ring: '#0aa7a0',
        chart1: '#0aa7a0',
        chart2: '#0f8fd6',
        chart3: '#e8742a',
        chart4: '#0f8fd6',
        chart5: '#7cc8c5'
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Noto Sans CJK SC"', 'Geist', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '0.5rem'
      }
    }
  },
  plugins: []
};
