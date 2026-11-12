# Break Room Arcade 🕹️

Real-time, serverless multiplayer party games for friends and teams during breaks, built for 4 to 12 players (with a 2+ player Testing Mode).

---

## 🚀 Tech Stack
- **Frontend:** React 18, TypeScript (Strict), Vite, React Router v6
- **Styling:** Tailwind CSS ("Arcade Night" & "Daylight" design system)
- **State Management:** Zustand, TanStack Query
- **Animation & Audio:** Framer Motion, canvas-confetti, synthesized Web Audio API
- **Backend & Database:** Supabase (Auth, PostgreSQL, Row Level Security, RPC functions, Realtime Broadcast & Presence)
- **Hosting:** Netlify (Static SPA)
- **CI & Maintenance:** GitHub Actions Keep-Alive ping
- **Testing:** Vitest (Unit), Playwright (Multi-browser Integration)

---

## 📁 Project Structure
```
├── .github/workflows/
│   └── keepalive.yml       # 3-day cron ping to prevent Supabase auto-pause
├── docs/
│   ├── LIMITS.md           # Free-tier quotas & Realtime message budget
│   └── LICENSES.md         # Open-source attributions & dictionary license
├── public/                 # Static assets, icons, fonts
├── src/
│   ├── components/         # Reusable UI, modals, buttons, layout, avatar
│   ├── lib/
│   │   ├── avatars.ts      # 20 mascot avatars definition & fallbacks
│   │   ├── scoring.ts      # Authoritative scoring formulas for all games
│   │   ├── sound.ts        # Pure Web Audio synthesizer
│   │   ├── supabase.ts     # Supabase client wrapper
│   │   └── time-sync.ts    # Server clock offset calibration engine (TM-1..5)
│   ├── pages/              # Application views (Auth, Lobby, Games, Admin)
│   ├── stores/             # Zustand state management
│   ├── types/              # Database schema & TypeScript definitions
│   ├── App.tsx             # Route configuration
│   └── main.tsx            # Entry point
├── supabase/
│   ├── migrations/         # Database migrations
│   └── setup.sql           # Complete consolidated SQL schema, RLS, and RPCs
├── tests/                  # Unit and integration test suites
├── netlify.toml            # SPA redirects & build config
├── SETUP.md                # Step-by-step owner deployment guide (H1-H9)
└── package.json
```

---

## 🛠️ Getting Started Locally
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Follow [SETUP.md](SETUP.md) to set up your Supabase project in the Asia region (Mumbai/Singapore) and paste your credentials into `.env.local`.
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Run automated tests:
   ```bash
   npm test
   ```
6. Build for production:
   ```bash
   npm run build
   ```

