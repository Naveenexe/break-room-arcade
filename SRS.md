# Break Room Arcade: Software Requirements Specification (SRS)

Version 1.0 | Date: 12 November 2026 | Audience: the AI coding agent (Google Antigravity) and the project owner

---

## 0. How to use this document

This file is the single source of truth for building **Break Room Arcade**, an online multiplayer game site where friends and colleagues play together in a shared room.

Words used with specific meaning:
- **MUST / MUST NOT**: mandatory. The build is not done until every MUST is met.
- **SHOULD**: expected unless there is a documented reason.
- **HUMAN-REQUIRED**: a step only the project owner can do (creating accounts, pasting keys, clicking dashboard settings). See Section 11.

### 0.1 Agent working agreement (read first)

1. Read this entire document before writing code. Then produce an **implementation plan** (milestones from Section 13, risks, open questions) and wait for the owner's approval before building.
2. Build milestone by milestone. At the end of each milestone, run the tests in Section 12 and report results honestly. Never claim a game works without running its automated multi-player test.
3. Never invent credentials, URLs or API keys. When a HUMAN-REQUIRED step is reached, **stop**, show the owner a numbered click-by-click checklist, and continue only after the owner confirms.
4. Dashboard menus change. Before writing any setup instruction for Supabase, Netlify or GitHub, check the vendor's current official documentation and give the current labels. If unsure, say so.
5. Do everything you can yourself: write code, SQL migrations, config files, tests, scripts, images (using your image-generation ability, see Appendix C), and documentation. Only ask the owner for what you truly cannot do.
6. No placeholders, no "TODO", no fake data left in the shipped build. No game may be stubbed.
7. Keep secrets safe: the Supabase `service_role` key MUST NEVER appear in frontend code, the repository, or the deployed site.
8. Write a `SETUP.md` (owner-facing, plain language) and a `README.md` (developer-facing) as you go.

---

## 1. Product overview

### 1.1 Purpose
Give a group of friends a fun, polished, reliable set of quick party games to play together online during short breaks (office hours, lunch, evenings).

### 1.2 Users
- **Players**: friends and colleagues, mostly on phones and laptops, sharing a room. Not technical.
- **Host**: the player who creates a room and controls which game is played.
- **Admin**: the owner. Imports AI-generated content (questions, words, passages) into the content bank.

### 1.3 Scope: six games
1. **Pictionary** (live shared drawing canvas)
2. **Emoji Charades**
3. **Word Chain Blitz**
4. **Reaction Duel** (everyone vs everyone)
5. **Typing Race** (live race lanes)
6. **Quick Draw Quiz** (speed multiple choice)

### 1.4 Core requirements from the owner
- Real online multiplayer: rooms of **4 to 12 players** (minimum 4 to start; see FR-ROOM-6 for a testing exception).
- Login with **email and a 6-character password**.
- A host creates a room and sets a **room password**; others join with room code plus password.
- AI-generated content (questions and so on) is **generated outside the app, in a prescribed JSON format, imported once, and stored**. The app MUST NOT call any AI API at play time.
- Deployment on **free tiers only**.
- Visually excellent, interactive, easy to navigate.
- **Every game MUST work correctly and fairly, with accurate timing, even with mismatched device clocks, network lag, refreshes and disconnects.**

### 1.5 Out of scope (v1)
Voice/video chat, payments, social login, native apps, global leaderboards, public matchmaking, moderation tooling beyond host kick, languages other than English.

### 1.6 Assumptions and constraints
- Free-tier limits apply (see Section 4.3). Design to stay well within them.
- Players are friends. Defending against a determined cheater with a modified client is out of scope. Accidental unfairness (lag, clock skew, refresh) is in scope and MUST be handled. Leaking secrets (the word to draw) through the network to other players MUST be prevented.

---

## 2. Technology stack (mandated unless a documented better choice exists)

| Layer | Choice |
|---|---|
| Frontend | Vite, React, TypeScript (strict), React Router |
| Styling | Tailwind CSS with design tokens from Section 9 |
| Animation | Framer Motion (respect reduced motion); canvas-confetti for celebration |
| State | Zustand for client state; TanStack Query for fetched data |
| Backend | **Supabase** (free plan): Auth, Postgres, Row Level Security, RPC functions, Realtime (Broadcast, Presence, Postgres Changes) |
| Hosting | **Netlify** (free plan) for the static site |
| CI/Keep-alive | GitHub Actions (free) |
| Tests | Vitest (unit), Playwright (multi-browser integration) |
| Sound | Web Audio API, synthesized in code (no audio files) |

No custom always-on server. All authoritative logic lives in Postgres RPC functions; the browser is only a client.

---

## 3. System architecture

```
Browser (React SPA on Netlify)
  |-- supabase-js Auth ---------> Supabase Auth (email + password)
  |-- RPC calls ----------------> Postgres functions (authoritative rules, secrets, scoring)
  |-- Postgres Changes ---------> room, players, scores (state of record)
  |-- Broadcast (private channel)> high-frequency, non-authoritative data
  |                                (strokes, typing progress, emoji clue, reaction GO)
  `-- Presence -----------------> who is connected
```

### 3.1 Principles
- **P1 Authoritative state in Postgres.** Room phase, scores, turn order, secrets and guess validation live in the database and change only through RPC functions (`SECURITY DEFINER`, validating the caller).
- **P2 Secrets never reach unauthorized clients.** The Pictionary word, charades prompt and quiz correct answer are never sent to players who must not know them. Guesses and answers are validated server-side by RPC, which returns only correct, close or wrong.
- **P3 Time is absolute and server-synchronised.** Phases carry `phase_ends_at` (server UTC). Clients render countdowns from a corrected clock (Section 6). No game logic may depend on counting `setInterval` ticks.
- **P4 Anyone can advance an expired phase.** `advance_phase(room_id, expected_version)` is idempotent: it only acts if server time has passed `phase_ends_at` and `version` matches. Any connected client calls it after a short random delay (0.3 to 1.2 s) once the timer expires. The game never stalls if the host leaves or sleeps.
- **P5 Recoverable.** A refresh, reconnect or second tab restores the full current view from the database plus a snapshot of broadcast-only data (e.g. canvas strokes).

---

## 4. Data and security model

### 4.1 Tables (minimum; the agent may refine and MUST justify deviations)

- `profiles(id uuid pk -> auth.users, display_name text 2-20 chars, avatar_id text, is_admin bool default false, created_at)`
- `rooms(id uuid pk, code text unique, password_hash text, host_id uuid, status text, settings jsonb, current_game text, phase text, game_state jsonb, phase_started_at timestamptz, phase_ends_at timestamptz, version int, created_at, last_active_at)`
- `room_players(room_id, user_id, joined_at, last_seen_at, is_spectator bool, total_score int, pk(room_id,user_id))`
- `game_sessions(id, room_id, game text, options jsonb, started_at, ended_at, results jsonb)`
- `round_secrets(id, room_id, session_id, round_no, visible_to uuid null, kind text, payload jsonb)` with RLS: a row is selectable only by `visible_to = auth.uid()` (null means never selectable by clients, readable only inside RPCs)
- `score_events(id, session_id, user_id, points int, reason text, created_at)`
- `content_items(id, game text, payload jsonb, category text, difficulty smallint, content_hash text, created_at, created_by)` with `unique(game, content_hash)`
- `room_content_used(room_id, content_id)` so a room never sees repeats

Room codes: 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no look-alike characters), unique.

### 4.2 RPC functions (minimum set)

`server_now()`, `create_room(settings, room_password)`, `join_room(code, room_password)`, `leave_room(room_id)`, `kick_player(room_id, user_id)` (host only), `update_settings(room_id, settings)` (host), `start_game(room_id, game, options)` (host), `advance_phase(room_id, expected_version)` (anyone in room), `submit_guess(room_id, text)`, `submit_answer(room_id, question_no, choice_index, client_elapsed_ms)`, `submit_reaction(room_id, round_no, ms)`, `submit_typing_result(room_id, stats)`, `submit_word(room_id, word)`, `end_game(room_id)` (host), `import_content(payload jsonb)` (admin only), `keepalive()`.

### 4.3 Security requirements
- **SEC-1** Row Level Security MUST be enabled on every table, with tests proving a non-member cannot read or write another room's data and a non-admin cannot import content.
- **SEC-2** Room passwords MUST be stored hashed (e.g. `pgcrypto` `crypt` with a salt), checked inside `join_room`, and never returned to any client. Add basic rate limiting on failed joins (e.g. 5 attempts per minute per user).
- **SEC-3** Realtime Broadcast MUST use **private channels** with authorization policies so only room members can subscribe to `room:{id}` topics.
- **SEC-4** Only the `anon` key is used in the browser. Account passwords are handled by Supabase Auth (hashed server-side).
- **SEC-5** Never trust client-sent scores. Points are computed in RPC functions.
- **SEC-6** The first admin is made by the owner running one SQL statement (Section 11). No admin sign-up path in the UI.
- **SEC-7** Escape all user-provided text (display names, chat guesses) when rendering. No raw HTML.

### 4.4 Free-tier limits to design around
At the time of writing, the Supabase free plan allows roughly 200 concurrent realtime connections, 2 million realtime messages per month, 500 MB database, 50,000 monthly active users, and **pauses a project after 7 days of inactivity**. These figures change; the agent MUST re-verify them against Supabase's official pricing page and document the verified numbers in `docs/LIMITS.md`.

---

## 5. Content bank (AI-generated, stored once)

- **CB-1** Game content (quiz questions, Pictionary words, charades prompts, typing passages) comes from the `content_items` table. The app never calls an AI API during play.
- **CB-2** The owner generates content in any AI chat using the prompts in Appendix A, receives JSON in the exact schemas in Appendix B, and pastes it into the Admin Import page.
- **CB-3** The Import page MUST: validate against the schema with line-level error messages; show a preview with counts; skip duplicates (via normalised content hash) and report how many were new vs skipped; accept multiple batches over time; allow deleting items and filtering by game, category, difficulty.
- **CB-4** If a game is started with fewer unused items than needed, the host sees a clear message ("Not enough quiz questions in this category: 6 available, 10 needed") and the game does not start in a broken state.
- **CB-5** Ship a **seed pack** of at least 60 quiz questions, 150 Pictionary words, 80 charades prompts and 40 typing passages so the app works on day one. The agent writes these itself, following Appendix B.
- **CB-6** Word Chain Blitz uses a bundled English word list (use a permissively licensed list such as ENABLE; record the licence in `docs/LICENSES.md`), loaded lazily and compressed. No content import needed.

---

## 6. Realtime and timing model (critical)

### 6.1 Clock synchronisation
- **TM-1** On joining, and every 60 seconds afterwards, each client estimates its offset from the server clock: call `server_now()` at least 5 times, compute `offset = server_time - (t_send + t_recv)/2` for each, and use the **median of the three lowest-RTT samples**. Store `offset` and the RTT.
- **TM-2** `correctedNow() = Date.now() + offset`. All countdowns, deadlines and elapsed times use `correctedNow()` against server timestamps.
- **TM-3** Countdown displays MUST be driven by `requestAnimationFrame` or a short interval that recomputes `phase_ends_at - correctedNow()` each tick, so background tabs, throttled timers and device sleep cannot cause drift.
- **TM-4** A visible but subtle sync indicator shows "Synced" or "Reconnecting…" status; if RTT exceeds 800 ms show a "Slow connection" hint.
- **TM-5** Tests MUST simulate a client whose clock is wrong by +5 s and -5 s and prove its countdown matches other clients within 150 ms.

### 6.2 Phase state machine
Every game is a sequence of phases with a `phase_ends_at`. Example (Pictionary): `lobby -> choosing_word -> drawing -> round_result -> (repeat) -> game_result`. Each phase transition increments `rooms.version`. Clients subscribe to changes on their room row and render purely from `(phase, game_state, phase_ends_at)`.

### 6.3 Reliability
- **TM-6** Presence heartbeat every 10 s; a player is marked disconnected after 25 s without heartbeat. Disconnected players are skipped in turn-based games and shown greyed out.
- **TM-7** On reconnect, the client re-fetches room state, re-syncs the clock, requests a broadcast snapshot (canvas strokes, typing progress) and resumes without user action.
- **TM-8** If the **host** leaves or disconnects for over 30 s, the earliest-joined connected player becomes host automatically, announced in a toast.
- **TM-9** If the current drawer/actor/turn-taker disconnects, their turn ends after 10 s of absence, they score 0 for that turn, and play continues.
- **TM-10** Late joiners during a game become **spectators** until the next game starts; they see the live game.
- **TM-11** Rooms with no activity for 24 h are deleted lazily (during `create_room`).

### 6.4 Message budget (free-tier safety)
- **TM-12** Stroke data is normalised (0 to 1 coordinates), simplified (Ramer-Douglas-Peucker or similar), and sent in **batches every 80 to 100 ms**, never per mouse event.
- **TM-13** Typing progress is sent at most 4 times per second per player and only when it changed.
- **TM-14** Reaction, quiz and word chain do not stream; they send discrete events only.
- **TM-15** Document a per-game message estimate in `docs/LIMITS.md`. Target: a 30-minute, 6-player session SHOULD use under 40,000 messages (counted conservatively as sent x recipients). Provide a dev-only message counter overlay.

---

## 7. Functional requirements

### 7.1 Accounts and profile
- **FR-AUTH-1** Sign up and log in with email + password. Password MUST be exactly 6 characters (letters and digits allowed). Show a clear note: "Use a simple password just for this game. Don't reuse a real one."
- **FR-AUTH-2** Email confirmation is OFF (owner setting). Sign-up lands the user directly in profile setup.
- **FR-AUTH-3** Log out, "forgot password" (via Supabase reset email, may be best-effort within free email limits; if unavailable, explain), and persistent session across refreshes.
- **FR-AUTH-4** Friendly errors: wrong password, email in use, weak password, offline. No raw error text.
- **FR-PROF-1** First login: choose display name (2 to 20 characters, profanity-light filter optional) and one of 20 avatars (Appendix C). Editable later.
- **FR-PROF-2** Avatar fallback: coloured circle with initials if an image fails to load.

### 7.2 Rooms and lobby
- **FR-ROOM-1** Home screen offers two big actions: **Create room** and **Join room**.
- **FR-ROOM-2** Create room: host sets a room password (4 to 12 characters), max players (4 to 12, default 8), and optional default round settings. The room gets a 5-character code.
- **FR-ROOM-3** Join room: enter code + password. Errors: room not found, wrong password, room full. Joining by shareable link (`/join/ABCDE`) pre-fills the code (never the password).
- **FR-ROOM-4** Lobby shows: code (tap to copy), a "Copy invite" button producing a message with link, avatar grid of players with live connected/disconnected status, host crown, and a game picker.
- **FR-ROOM-5** Game picker: six game cards. Host can choose a game, or switch on **"Let the room vote"** (everyone votes, highest wins, tie broken randomly). Each card shows min/max players, estimated duration and a how-to-play sheet.
- **FR-ROOM-6** The game can start only with **at least 4 connected players**, except when the host enables **"Testing mode (allow 2 or more players)"**, shown with a clear label. Testing mode exists so the owner can verify games alone with two devices.
- **FR-ROOM-7** Host controls: kick, transfer host, change settings, end game early, close room.
- **FR-ROOM-8** Cumulative **session scoreboard** persists across games within a room.
- **FR-ROOM-9** After every game: animated **podium** (top 3), full ranking, and buttons "Play again", "Pick another game", "Back to lobby".

### 7.3 Shared game rules
- **FR-GAME-1** Every game starts with a 3-2-1 countdown synced to a server timestamp so all players begin together.
- **FR-GAME-2** Every game has a how-to-play overlay (skippable) and a visible timer, player strip with scores, and an exit/leave control.
- **FR-GAME-3** Points are awarded only by RPCs and recorded in `score_events` for auditability.
- **FR-GAME-4** Ties are broken in this order: higher score, then earlier final scoring event.

### 7.4 Game: Pictionary
- Rounds: every connected player draws once per cycle; host chooses 1 to 3 cycles (default 1). Round time default 80 s (60 to 120).
- **PIC-1** The drawer receives **3 word choices** (privately, via `round_secrets`) and picks one within 12 s, else one is auto-picked.
- **PIC-2** Drawing tools: 8 colours from the palette, eraser, 3 brush sizes, undo last stroke, clear all, and fill bucket (nice-to-have). Works with mouse, touch and stylus; `touch-action: none` on the canvas; no page scrolling while drawing.
- **PIC-3** Strokes stream live to all others (Section 6.4), numbered by sequence. Receivers detect gaps and request a resend. Late joiners/reconnectors get a full snapshot.
- **PIC-4** Canvas is resolution-independent: strokes use normalised coordinates and render correctly on every screen size.
- **PIC-5** Guessers see a masked word (underscores with length) and **hints**: one letter revealed at 50% time and another at 75%.
- **PIC-6** Guesses are typed in a chat-style input and validated server-side by `submit_guess`. Matching: case-insensitive, accents and punctuation removed, leading "a/an/the" ignored, simple plural accepted. A guess within edit distance 1 (for words of 5+ letters) shows a private "So close!" to that guesser only.
- **PIC-7** A correct guess is announced as "X got it!" without revealing the word until round end. The guesser can no longer chat-guess; the drawer and others cannot see correct words typed.
- **PIC-8** Scoring: guesser = 100 + round(150 x remaining_time / total_time) + 30 if first correct; drawer = 50 per correct guesser (capped at 300) + 50 bonus if everyone guessed. The round ends early when all guessers are correct.
- **PIC-9** Round result screen reveals the word, shows points gained and a replay-style "gallery" of the final drawing for 5 s.

### 7.5 Game: Emoji Charades
- Rounds rotate among players as the "actor". Default 60 s per round, one cycle (1 to 2).
- **EMO-1** The actor receives a private prompt (movie, phrase, office saying, food, place) from the content bank and can see its category and word count.
- **EMO-2** The actor composes a clue using **only emojis** (validated; letters and digits are rejected with a friendly message). Includes an emoji picker with categories and a recents row. Clue updates stream live to everyone (throttled).
- **EMO-3** Guessing, matching, "So close!", scoring, early round end and result screen follow PIC-6 to PIC-9.
- **EMO-4** Actor can use one **skip** per round at a 25-point penalty.

### 7.6 Game: Word Chain Blitz
- Turn-based elimination. Default start time per turn 10 s, shrinking by 0.5 s after each valid word to a minimum of 4 s.
- **WCB-1** Rules: word has 3 or more letters, letters only, starts with the last letter of the previous word, has not been used this game, and exists in the bundled dictionary.
- **WCB-2** The current player's turn deadline is the server-synced `phase_ends_at`. Everyone sees the same shrinking bar and a large "next letter".
- **WCB-3** Validation is by `submit_word` RPC. On rejection, show the specific reason ("Not in dictionary", "Already used", "Must start with R") and the turn timer **keeps running**.
- **WCB-4** If a player's time runs out they are eliminated, shown with a short animation. Eliminated players spectate and see the chain.
- **WCB-5** Turn order is randomised at start. Disconnected players are skipped without being eliminated for the first 10 s, then eliminated.
- **WCB-6** The game ends when one player remains. Scoring: 10 points per valid word, plus placement bonus (winner 100, second 60, third 40, others 20).
- **WCB-7** A scrolling "chain so far" list highlights the connecting letters.
- **WCB-8** If the dictionary fails to load, the game MUST NOT start; show a retry option.

### 7.7 Game: Reaction Duel
- Everyone plays at once. Default 5 rounds.
- **REA-1** Each round: screen shows "Wait for green…" in a calm colour. After a random delay of 2 to 7 s chosen by the referee RPC, a **GO** signal is broadcast and every client turns green.
- **REA-2** The reaction time is measured **locally** from the moment the green frame is painted (use `requestAnimationFrame` plus `performance.now()`) to the tap. Network delay differences therefore do not affect the measurement. The referee client MUST also wait for its own broadcast echo before turning green, so the host has no advantage.
- **REA-3** Tapping before green is a **false start**: that player scores 0 for the round, sees "Too early!" and cannot tap again that round.
- **REA-4** Implausible times (under 80 ms) are rejected as false starts. Players who do not tap within 3 s score 0.
- **REA-5** Submit via `submit_reaction`. Round result shows a ranked bar chart in milliseconds with player avatars.
- **REA-6** Scoring per round by rank: 100, 80, 65, 50, 40, 30, then 20 for all others who tapped validly. Final ranking sums rounds; also show each player's average and best time.
- **REA-7** Must work with touch (tap anywhere on the large target) and keyboard (Space/Enter).

### 7.8 Game: Typing Race
- Everyone types the same passage simultaneously. Default 1 passage per game (1 to 3).
- **TYP-1** Passage (120 to 220 characters, plain ASCII) appears after the synced countdown. The clock starts at the scheduled start time for everybody.
- **TYP-2** Per-character feedback: correct in a success colour, errors highlighted with an underline plus colour, current caret clearly visible. Backspace allowed. The player must correct errors to finish (the finish condition is an exactly matching text).
- **TYP-3** Paste, drop and autocorrect-assisted insertion are blocked. On mobile, disable autocomplete, autocapitalise and spellcheck on the input.
- **TYP-4** **Race lanes**: each player's avatar moves along a lane showing progress, updated live from throttled broadcasts (Section 6.4).
- **TYP-5** Net WPM = (correct characters / 5) / minutes. Accuracy = correct keystrokes / total keystrokes. Time limit 90 s; unfinished players are ranked by progress.
- **TYP-6** Scoring: placement points 100, 80, 65, 50, 35 for the rest, multiplied by 0.75 if accuracy is under 90%. Unfinished players get 20 + progress% x 0.3.
- **TYP-7** The server validates plausibility (reject results above 250 WPM or elapsed time below the minimum possible) in `submit_typing_result`.

### 7.9 Game: Quick Draw Quiz
- Speed multiple choice for everyone at once. Default 10 questions (5 to 20), 15 s each, filtered by categories chosen by the host.
- **QZ-1** A question with four options appears to everyone simultaneously at a server timestamp. Correct answers are **not** present in client data until the reveal.
- **QZ-2** A player locks in an answer once; the UI shows "Locked in" without revealing correctness. Elapsed time is measured from `correctedNow()` minus the question start and also validated by the server arrival time within a tolerance.
- **QZ-3** Scoring: correct = 100 + round(100 x (1 - elapsed/limit)); wrong or no answer = 0; streak bonus of +10 per consecutive correct answer, capped at +50. Optional host setting: wrong-answer penalty of 25.
- **QZ-4** At question end: reveal the correct answer, an optional one-line explanation, how many players chose each option, and the fastest correct player ("Quickest: Ravi, 2.1 s").
- **QZ-5** Show a live ranking strip between questions. The quiz ends early only if all players have answered (then the reveal begins immediately).
- **QZ-6** Items are drawn without repeats via `room_content_used`.

---

## 8. Admin and utility pages
- **ADM-1** `/admin/import` (admin only): paste JSON, validate, preview, import (Section 5).
- **ADM-2** `/admin/content`: browse, filter and delete content; counts per game and category.
- **ADM-3** `/about`: how to play each game, credits, licences.
- **ADM-4** Friendly 404 and "Reconnecting" screens.

---

## 9. UI/UX and visual design

### 9.1 Design intent
**Late-night arcade meets sticker book.** Warm, loud, friendly, generous with colour, but with calm surfaces so gameplay stays readable. The memorable elements are the chunky illustrated **game cards** and the animated **podium**. Everything else stays quiet and disciplined.

### 9.2 Colour system (dark default, light optional)

Define as CSS variables and Tailwind tokens. Dark theme is the default; provide a light theme and a toggle (also respect `prefers-color-scheme` on first visit).

**Dark ("Arcade Night")**
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#1E1B3A` | page background (midnight plum) |
| `--surface` | `#2A2650` | cards, panels |
| `--surface-raised` | `#383270` | modals, active cards |
| `--line` | `#4C4690` | borders, dividers |
| `--text` | `#F7F4FF` | primary text |
| `--text-muted` | `#B9B3DE` | secondary text |
| `--primary` | `#FF5FA2` | main buttons (bubblegum); text on it is `--bg` |
| `--success` | `#3DDBB0` | correct, connected |
| `--danger` | `#FF5C6C` | wrong, eliminated |
| `--warn` | `#FFD23F` | timers running low, hints |

**Light ("Daylight")**: `--bg #F4F2FF`, `--surface #FFFFFF`, `--surface-raised #FFFFFF` with a stronger border, `--line #D6D0F5`, `--text #231F4A`, `--text-muted #5F5A8F`, `--primary #E0357F` with white text, success `#0E9F7A`, danger `#D63348`, warn `#B87F00`.

**Game signature colours** (used for each game's card, header accent and result screen glow):
Pictionary tangerine `#FF8A3D`, Emoji Charades sunshine `#FFD23F`, Word Chain mint `#3DDBB0`, Reaction coral `#FF5C6C`, Typing Race sky `#4DB5FF`, Quiz grape `#A47BFF`.

Rules:
- Text contrast MUST be at least 4.5:1 (3:1 for large text and UI icons) in both themes. Text on bright accents uses `--bg` (dark ink), not white.
- Never rely on colour alone: pair with icons and labels (correct tick, wrong cross, crown).
- **Use gradients in one place only**: the soft spotlight glow behind the lobby hero and the podium. No decorative gradient washes elsewhere.
- Reaction Duel's "GO" screen uses a full-bleed bright green (`#2EE37D` with dark text) and the wait screen a calm amber so the change is unmistakable.

### 9.3 Typography
- Display and headings: **Fredoka** (rounded, friendly), weights 600 and 700.
- Body and UI: **Figtree**, weights 400, 600, 700.
- Typing Race passage: **Atkinson Hyperlegible** at 22 px or more, line height 1.8, with generous letter spacing.
- Scale (px): 12, 14, 16, 18, 22, 28, 36, 48, 64. Body 16. Line length under 70 characters.
- Sentence case everywhere. No all-caps labels, no tracked-out eyebrows, no decorative numbering.
- Self-host the fonts (fall back to system fonts with swap) to avoid layout shift.

### 9.4 Shape, space, motion, sound
- Shape: pill buttons (radius 999), cards radius 20, modals radius 28, inputs radius 14. Thick 2 px borders in `--line`. Primary buttons have a chunky 4 px bottom "press" edge that compresses on press.
- Spacing on a 4 px grid. Tap targets at least 48 px.
- Motion: springy but brief (150 to 400 ms). One orchestrated moment per screen at most. Mandatory moments: countdown pulse (3-2-1-GO), correct-answer pop, elimination shake, podium rise with confetti. Respect `prefers-reduced-motion` (replace with fades, no confetti).
- Sound: synthesized with Web Audio: tick (last 5 s), correct chime, wrong buzz, GO beep, win fanfare. A global **mute toggle** and volume stored in `localStorage`. Sound off by default on first visit until the user taps unmute, with a visible unmute button.
- Haptics: short vibration on correct/wrong where supported.

### 9.5 Layout and navigation
- Mobile first (360 px wide up), scaling to a two-column desktop layout (game area plus side panel for player list and scores).
- Persistent top bar: logo, room code, connection status, mute, theme, avatar menu.
- In-game: top = timer and round info, centre = game area, bottom (mobile) = input or tools, side (desktop) = player strip and live scores.
- Landscape drawing: on phones, show the canvas as large as possible; tools collapse into a bottom sheet.
- Every screen has a clear single primary action.

### 9.6 Screens (all MUST exist)
Landing/login, sign-up, profile setup (name + avatar picker), home (create / join), create-room form, join-room form, lobby (players, picker, vote, settings), how-to-play sheet, one full screen set per game (intro, active, round result, game result), podium and session scoreboard, admin import, admin content, settings (theme, sound, profile), about, 404, reconnecting banner.

### 9.7 Empty, loading and error states
Skeleton loaders, never blank screens. Every error explains what happened and what to do, in plain language. The lobby with only one player shows an illustration and "Invite friends with the code above."

### 9.8 Accessibility
Keyboard operable everywhere (except drawing, which is pointer-based, and chat guessing which is text), visible focus rings, ARIA live regions for timers and announcements, labelled controls, semantic landmarks, screen-reader friendly scoreboards, support for 200% zoom.

### 9.9 Image and art assets (generated by the agent; Appendix C has prompts)
Logo and favicon set, social share image, 20 avatars, 6 game cover illustrations, 4 empty/celebration illustrations. Consistent style: flat sticker-style vector illustration, thick dark outline, restricted palette from 9.2. Deliver as optimised WebP/SVG with a transparent background where appropriate, each under 80 KB (covers under 150 KB). If image generation is unavailable, fall back to procedurally generated SVG avatars and CSS-drawn game icons, and tell the owner.

---

## 10. Non-functional requirements
- **NFR-1 Performance**: initial JS under 250 KB gzipped; each game is a lazily loaded route chunk; Largest Contentful Paint under 2.5 s on a mid-range phone over 4G; UI feedback within 100 ms of any tap.
- **NFR-2 Capacity**: 4 to 12 players per room; support at least 15 simultaneous rooms within the free realtime limits.
- **NFR-3 Compatibility**: latest two versions of Chrome, Edge, Firefox and Safari; iOS Safari 16+ and Android Chrome; responsive from 360 px.
- **NFR-4 Reliability**: a refresh or a 20 s network drop mid-game recovers automatically without losing score or state.
- **NFR-5 Installable**: web app manifest and icons so the site can be added to a phone's home screen (offline play not required).
- **NFR-6 Privacy**: store only email, display name, avatar and game data. No third-party analytics or trackers. Include a short privacy note.
- **NFR-7 Maintainability**: TypeScript strict, ESLint, Prettier, a documented folder structure, game logic separated from UI, each game a self-contained module implementing a common `GameModule` interface.

---

## 11. Setup and deployment

The agent prepares everything and gives the owner a click-by-click `SETUP.md`. Steps marked **H** are HUMAN-REQUIRED.

- **H1 Create Supabase project.** Create a free Supabase account and a new project. Choose the region nearest to the players (for India, a South Asia region such as Mumbai if offered). Save the database password somewhere safe.
- **H2 Apply the database.** The agent provides ordered SQL files in `supabase/migrations/` and a single combined `supabase/setup.sql`. The owner pastes it into the Supabase SQL editor (or uses the CLI the agent explains). The agent MUST include policies, RPC functions, the realtime publication entries and Realtime authorization policies.
- **H3 Auth settings.** Enable the Email provider, turn **Confirm email OFF**, set minimum password length to **6** with no extra complexity rule.
- **H4 Realtime settings.** Verify private-channel authorization is enforced (public access to channels off) and the tables the app listens to are in the realtime publication.
- **H5 Keys.** Copy the project URL and **anon (public)** key into `.env.local` for local runs. **Never use or share the `service_role` key.**
- **H6 GitHub and Netlify.** Create a GitHub repository and push the project. In Netlify, "Add new site → Import from Git", select the repo; build command `npm run build`, publish directory `dist`. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The agent provides `netlify.toml` including the single-page-app redirect rule.
- **H7 Auth URLs.** After the first deploy, put the Netlify URL into Supabase's Site URL and redirect URL allow-list.
- **H8 First admin.** Sign up in the live app, then run the one-line SQL (provided in `SETUP.md`) in the SQL editor to set `is_admin = true` for your profile.
- **H9 Keep-alive.** Add the two GitHub repository secrets the agent names so a scheduled GitHub Actions workflow calls `keepalive()` every 3 days, preventing the free project from pausing. The agent writes the workflow file.
- **H10 Content.** Run the Appendix A prompts in any AI chat and import the results on `/admin/import`.
- **H11 Smoke test.** Play every game with at least two devices (using Testing mode) and then with four.

Where the agent has the tools and the owner's explicit permission (for example browser control while logged in), it MAY perform an H step itself, but MUST first state exactly what it will do and what it will touch.

---

## 12. Testing and acceptance

### 12.1 Required automated tests
1. **Unit tests**: scoring formulas for all six games; guess normalisation and closeness; word validation; ranking and tie-breaking; clock-offset median calculation; stroke batching/simplification.
2. **Database/RLS tests**: a non-member cannot read or write another room; secrets are invisible to unauthorised users; non-admins cannot import; wrong room password rejected and rate-limited; `advance_phase` is idempotent under concurrent calls.
3. **Multi-player integration tests (Playwright, 4 to 6 browser contexts per game)**: create room, join with password, play a complete game, assert final scores equal expected values. One test per game, plus: voting; host leaves mid-game (host migrates, game continues); a player refreshes mid-round (state restored); a late joiner becomes a spectator; a disconnected player is skipped.
4. **Timing tests**: clients with clock skew of +5 s and -5 s show matching countdowns (within 150 ms); simulated 300 ms latency and 3% packet loss do not break any game; a backgrounded tab resumes with correct timer values.
5. **Soak test**: a scripted bot swarm (`scripts/simulate.ts`, using normal test accounts, never the `service_role` key in the frontend) plays 20 consecutive games without a stuck phase.

### 12.2 Definition of done per game
A game is done only when: the automated 4+ player test passes; the game recovers from a refresh and a host change; scores match the formulas; no secret answer or word appears in any network response visible to a non-entitled player (verified by test); timers stay in sync under clock skew; and the UI works on a 360 px phone and a desktop.

### 12.3 Manual acceptance checklist (the owner runs this)
- [ ] Sign up with a 6-character password and log in on two devices.
- [ ] Create a room with a password; join from another device with code + password; wrong password is rejected.
- [ ] Start with fewer than 4 players is blocked, and works in Testing mode.
- [ ] Play each of the six games to the podium.
- [ ] Refresh the page in the middle of Pictionary: the drawing and timer return.
- [ ] Close the host's tab: another player becomes host and the game continues.
- [ ] Import a JSON content batch; duplicates are skipped; the new items appear in games.
- [ ] Switch theme and mute sound; settings persist.

---

## 13. Milestones

1. **M1 Foundation**: project scaffold, design tokens, fonts, auth, profile with avatar picker, database migrations, RLS, clock sync, CI, deploy to Netlify, keep-alive. (HUMAN: H1 to H9)
2. **M2 Rooms and lobby**: create/join with password, presence, host controls, game picker and vote, session scoreboard, podium, sound system, test harness and bot simulator.
3. **M3 Content tooling**: content bank, admin import and browse, seed packs.
4. **M4 Fast games**: Typing Race, Reaction Duel, Quick Draw Quiz, with full tests.
5. **M5 Drawing and guessing**: Pictionary and Emoji Charades with full tests.
6. **M6 Word Chain Blitz** with dictionary and tests.
7. **M7 Polish and hardening**: art assets in place, animation and sound pass, accessibility audit, performance budget check, soak test, documentation (`SETUP.md`, `README.md`, `docs/LIMITS.md`, `docs/LICENSES.md`), final owner checklist.

---

## Appendix A: Prompts for the owner to use in any AI chat

Always request **JSON only**, in batches of about 50 items (long answers get cut off). Run the same prompt several times with a different `FOCUS` to build up the bank; the importer skips duplicates.

### A.1 Quiz questions
```
Generate 50 multiple-choice quiz questions for a friendly office game.
FOCUS: <e.g. general knowledge, technology, movies, geography, Indian history, sports, food, workplace humour>
Rules:
- Exactly 4 options per question, exactly one correct.
- Questions must be unambiguous, factual and checkable. No trick questions, no politics or religion, nothing offensive.
- Mix difficulty: 40% difficulty 1, 40% difficulty 2, 20% difficulty 3.
- Do not repeat any question. Keep each question under 120 characters and each option under 40 characters.
- "category" must be one of: general, science, technology, geography, movies, music, sports, food, history, india, workplace.
- "answerIndex" is the zero-based index of the correct option.
Return ONLY valid JSON, no markdown fences, no commentary, in exactly this format:
{"game":"quiz","version":1,"items":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"category":"general","difficulty":1,"explanation":"One short sentence."}]}
```

### A.2 Pictionary words
```
Generate 100 words for a drawing-and-guessing game.
FOCUS: <e.g. objects, animals, food, places, actions, office items>
Rules: concrete things that can be drawn in under 60 seconds; mostly 1 word, a few 2-word items; no proper names, brands or offensive items; no duplicates; mix difficulty 1 (easy) to 3 (hard).
"category" must be one of: objects, animals, food, places, actions, office, nature.
Return ONLY valid JSON, no markdown fences, no commentary, in exactly this format:
{"game":"pictionary","version":1,"items":[{"word":"umbrella","category":"objects","difficulty":1}]}
```

### A.3 Emoji charades prompts
```
Generate 60 prompts for an emoji charades game, where a player acts them out using only emojis.
FOCUS: <e.g. famous movies, everyday phrases, office sayings, food, places, songs (titles only)>
Rules: 1 to 4 words each; recognisable to a general audience; can be expressed with emojis; no offensive content; no duplicates; mix difficulty 1 to 3.
"category" must be one of: movies, phrases, office, food, places, music, activities.
"hint" is a short neutral clue such as "3 words" or "Movie".
Return ONLY valid JSON, no markdown fences, no commentary, in exactly this format:
{"game":"charades","version":1,"items":[{"prompt":"Work from home","category":"office","difficulty":1,"hint":"3 words"}]}
```

### A.4 Typing passages
```
Generate 40 passages for a typing race.
FOCUS: <e.g. workplace humour, fun facts, light office email style, tongue twisters>
Rules: each passage 120 to 220 characters; plain ASCII only (no smart quotes, no em dashes, no emoji, no tabs); normal sentence punctuation; read naturally; no duplicates; no offensive content.
"category" must be one of: office, facts, humour, tongue-twisters.
Return ONLY valid JSON, no markdown fences, no commentary, in exactly this format:
{"game":"typing","version":1,"items":[{"text":"The quick brown fox...","category":"humour","difficulty":1}]}
```

## Appendix B: JSON schemas (the importer MUST enforce these)

- Envelope: `{"game": "quiz"|"pictionary"|"charades"|"typing", "version": 1, "items": [ ... ]}`. Maximum 200 items per import.
- **quiz item**: `question` (string, 10 to 120 chars), `options` (array of exactly 4 distinct strings, each 1 to 40 chars), `answerIndex` (integer 0 to 3), `category` (enum), `difficulty` (1 to 3), `explanation` (optional string up to 140 chars).
- **pictionary item**: `word` (string, 2 to 24 chars, letters, spaces and hyphens), `category` (enum), `difficulty` (1 to 3).
- **charades item**: `prompt` (string, 2 to 40 chars), `category` (enum), `difficulty` (1 to 3), `hint` (optional string up to 20 chars).
- **typing item**: `text` (string, 120 to 220 chars, printable ASCII only), `category` (enum), `difficulty` (1 to 3).
- Duplicate detection: hash of the lowercased, whitespace-collapsed primary field (`question`, `word`, `prompt` or `text`).
- Error output lists the item index, the field and the reason.

## Appendix C: Image generation brief (for the agent's image tool)

**Global style string** (prepend to every prompt): "Flat sticker-style vector illustration, thick dark plum outline (#1E1B3A), simple soft shading, friendly rounded shapes, limited palette of bubblegum pink #FF5FA2, tangerine #FF8A3D, sunshine #FFD23F, mint #3DDBB0, sky #4DB5FF, grape #A47BFF, plus cream-free light highlights, centred composition, no text, no logos, no copyrighted characters."

**Avatars (20)**, 512x512, transparent background, head-and-shoulders mascot busts, each with a distinct palette accent: 1 sleepy owl, 2 grumpy cat, 3 chill capybara, 4 hype fox, 5 nerdy penguin, 6 zen panda, 7 sneaky raccoon, 8 cool dinosaur, 9 bubbly axolotl, 10 fancy llama, 11 chef hedgehog, 12 wizard frog, 13 astronaut bunny, 14 pirate parrot, 15 ninja otter, 16 DJ koala, 17 detective bear, 18 surfer seal, 19 coffee-loving sloth, 20 party chameleon. File names `avatar-01.webp` to `avatar-20.webp`.

**Game covers (6)**, 800x500, each dominated by the game's signature colour: Pictionary (a giant pencil drawing a wobbly rocket), Emoji Charades (a mask surrounded by floating emoji-like faces drawn in the style, not real emoji), Word Chain Blitz (chunky letter blocks linked like a chain), Reaction Duel (a big glowing green button with a lightning bolt), Typing Race (keyboard keys racing along a track), Quick Draw Quiz (a buzzer and a question bubble).

**Brand**: logo (a joystick shaped like a coffee cup, wordmark "Break Room Arcade" in Fredoka), favicon set (16, 32, 180, 192, 512), social share image 1200x630.

**Illustrations (4)**: empty lobby ("invite your friends"), waiting for host, celebration/podium confetti, connection lost.

Optimise everything to the size budgets in 9.9, and confirm the alt text for each asset.
