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
        ink: 'var(--ink)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        primary: 'var(--primary)',
        'primary-press': 'var(--primary-press)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        shadow: 'var(--shadow)',
        // SRS v2 Section 5.2 Signature Game Accent Colors
        game: {
          pictionary: '#FF7A59', // Tangerine
          charades: '#FFC94D',  // Marigold-light
          wordchain: '#B6E35B', // Lime
          reaction: '#FF8FB8',  // Hot pink
          typing: '#5CC8FF',    // Sky
          quiz: '#B9A4FF',      // Lilac
          // Reaction Duel signals
          wait: '#FFB627',
          go: '#2BD96B',
          decoyBlue: '#4F7CFF',
          decoyPink: '#FF8FB8',
          decoyPurple: '#8F6BFF',
        }
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        typing: ['"Atkinson Hyperlegible"', 'monospace', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        button: '12px',
        input: '12px',
        modal: '20px',
      },
      boxShadow: {
        tile: '4px 4px 0 var(--shadow)',
        'tile-sm': '3px 3px 0 var(--shadow)',
        'tile-lg': '6px 6px 0 var(--shadow)',
        'tile-primary': '3px 3px 0 var(--shadow)',
      }
    },
  },
  plugins: [],
}
