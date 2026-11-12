/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        line: 'var(--line)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        primary: 'var(--primary)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        // Signature game colors
        game: {
          pictionary: '#FF8A3D',
          charades: '#FFD23F',
          wordchain: '#3DDBB0',
          reaction: '#FF5C6C',
          typing: '#4DB5FF',
          quiz: '#A47BFF',
          go: '#2EE37D',
        }
      },
      fontFamily: {
        heading: ['Fredoka', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        typing: ['"Atkinson Hyperlegible"', 'monospace', 'sans-serif'],
      },
      borderRadius: {
        'card': '20px',
        'modal': '28px',
        'input': '14px',
      },
      boxShadow: {
        'press': '0 4px 0 var(--line)',
        'press-active': '0 1px 0 var(--line)',
        'press-primary': '0 4px 0 rgba(0,0,0,0.3)',
      }
    },
  },
  plugins: [],
}

