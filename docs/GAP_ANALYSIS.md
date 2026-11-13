# Break Room Arcade: Gap Analysis (v1 Codebase vs SRS v2)

**Date:** 14 November 2026  
**Auditor:** Google Antigravity Agent  
**Baseline Documents:** `docs/SRS.md` (v1), `docs/PROJECT_REPORT.md`  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` (v2)  
**Status Key:**
- **Met**: Fully conforms to SRS v2 specifications in the codebase.
- **Partly met**: Partial implementation exists, but missing critical SRS v2 requirements or contains defects.
- **Missing**: Not implemented in the codebase.

---

## 1. Verification of Defects (v2 Section 1: D1 to D9)

Each defect from Section 1 has been directly audited and verified in the actual codebase:

| Defect ID | Description | Verified in Code? | Exact Code Location & Evidence | Impact in Real Play |
|---|---|---|---|---|
| **D1** | Rounds advance only when the **host clicks** | **VERIFIED (Defect Exists)** | `src/games/ReactionDuel.tsx` (`handleHostStartRound` line 120, `handleNextRoundOrFinish` line 216); `src/games/QuickDrawQuiz.tsx` (`handleNextQuestionOrFinish` line 193); `src/games/TypingRace.tsx` (`handleFinish` line 175); `src/games/Pictionary.tsx` (`handleAdvanceDrawer` line 104); `src/games/EmojiCharades.tsx` (`handleAdvanceActor` line 67). | If host browser lags, refreshes, minimizes tab, or host leaves, game stalls indefinitely. Non-hosts have no way to proceed. |
| **D2** | Game events travel only as **Broadcast** messages | **VERIFIED (Defect Exists)** | `ReactionDuel.tsx` (lines 53-117), `QuickDrawQuiz.tsx` (lines 66-107), `TypingRace.tsx` (lines 78-109), `Pictionary.tsx` (lines 88-128), `EmojiCharades.tsx` (lines 59-90), `WordChainBlitz.tsx` (lines 87-114). All use `supabase.channel(...).send({ type: 'broadcast' })`. | No game state saved in PostgreSQL. A player refreshing loses all state, drops into blank/broken screen, or gets stranded on Round 1 results while others advance. |
| **D3** | Implemented RPCs lack game RPCs (`submit_guess`, `submit_answer`, `submit_word`, `submit_reaction`, etc.) | **VERIFIED (Defect Exists)** | `supabase/setup.sql` only contains `create_room`, `join_room`, `leave_room`, `kick_player`, `update_settings`, `start_game`, `import_content`. Client code does quiz checking against `SEED_QUIZ[i].answerIndex` in `QuickDrawQuiz.tsx` line 164; guessing against raw `secretWord` in `Pictionary.tsx` line 99; dictionary checking in `WordChainBlitz.tsx` line 54. | Cheating is trivial (answers inspectable in client bundle/network), secret words exposed to guessers, malicious clients can fabricate scores. |
| **D4** | Reaction duel waits for "All Taps Collected" without hard cap | **VERIFIED (Defect Exists)** | `src/games/ReactionDuel.tsx` line 188: `if (roundTaps.length >= totalConnected && totalConnected > 0)`. | If a single player disconnects, closes the window, or fails to tap, `roundTaps.length` never reaches `totalConnected`. Game hangs forever on green screen. |
| **D5** | Games are effectively **one round or one match** | **VERIFIED (Defect Exists)** | `TypingRace.tsx` has 1 passage; `WordChainBlitz.tsx` has 1 round; `ReactionDuel.tsx` repeats 5 identical rounds without Decoy or Target modes; `QuickDrawQuiz.tsx` has 10 identical questions without Jackpot; `Pictionary.tsx` and `EmojiCharades.tsx` have no round cycles. | No variety, no comeback opportunities, games feel flat and unpolished. |
| **D6** | Raw game scores added straight into room total | **VERIFIED (Defect Exists)** | `src/pages/game/GameScreen.tsx` line 96: `const totalScore = (p.total_score || 0) + matchScore;`. | Quiz scores (up to 2,500) swamp Reaction Duel (approx 500). Winner of evening is strictly determined by whichever game has larger point scale. |
| **D7** | `room_players` readable with `USING (true)` to `anon` and `authenticated` | **VERIFIED (Defect Exists)** | `supabase/setup.sql` line 164: policy on `rooms` allows `anon` read `USING (true)`. Line 177: policy on `room_players` allows `authenticated` read `USING (true)` without room membership check. | Any user, even unauthenticated or outside the room, can spy on rooms and list all players. Lacks non-recursive `is_room_member(room_id)` helper. |
| **D8** | `start_game(p_room_id, p_game)` lacks validated options argument | **VERIFIED (Defect Exists)** | `supabase/setup.sql` line 584 defines `p_options jsonb default '{}'::jsonb`, but completely ignores it in the function body; `LobbyPage.tsx` line 201 passes `{ p_room_id, p_game }` without options. No setup sheet in UI. | Host cannot configure round count, time limits, categories, or presets before starting a game. |
| **D9** | Disconnected players handled only by client presence | **VERIFIED (Defect Exists)** | `LobbyPage.tsx` line 131 uses a client-side `setInterval` updating `room_players.last_seen_at` directly. No `heartbeat(room_id)` RPC exists. Game components check `players.length` instead of active connected players within 25 seconds. | A backgrounded or disconnected tab halts "all players answered" conditions. |

---

## 2. Session and Round Engine (SRS v2 Section 2)

| Requirement ID | Requirement Summary | Status | File & Function / Component | Detailed Findings & Remediation |
|---|---|---|---|---|
| **E-1** | Phase deadline / early-end condition | **Partly met** | `src/pages/game/GameScreen.tsx`, `supabase/setup.sql` | `rooms.phase_ends_at` exists in DB schema, but game components track timers independently in local client state (`setInterval`) and use broadcast rather than database-driven phase transitions. Needs phase engine driven by DB state. |
| **E-2** | `advance_phase(room_id, expected_version)` callable by any connected member, idempotent | **Partly met** | `supabase/setup.sql` (`advance_phase`) | Function exists in SQL but is a stub returning a dummy JSON object without advancing game phase or updating `rooms.game_state`. Needs full state machine logic. |
| **E-3** | Client random delay (0.2s - 0.8s) after countdown zero with 3 retries | **Missing** | Client game components | Client components do not invoke `advance_phase` with randomized backoff. Host clicks or local intervals advance state. |
| **E-4** | Host has no required clicks during active game | **Partly met** | `src/games/*` | Host currently has required buttons: "Start Round", "Next Question", "Advance Drawer", "Finish Race". Must be replaced with automated phase progression. Host retains Skip / End Game / Kick controls. |
| **E-5** | Watchdog: if phase >5s past `ends_at`, clients retry `advance_phase` every 2s | **Missing** | `src/pages/game/GameScreen.tsx` | No watchdog timer exists in client or server. Stalled games remain stuck. |
| **E-6** | Latency clamping: `clamp(client_elapsed, server_elapsed - 600ms, server_elapsed)` | **Missing** | `src/lib/scoring.ts`, Server RPCs | Scores currently use client `timeSync.correctedNow() - startRef` directly with no server-side clamping. |
| **E-7** | Late submission grace window: `arrival <= ends_at + min(rtt/2, 400ms)` | **Missing** | Server RPCs | No server arrival time validation exists because submissions are broadcast over client channels without server timestamping. |
| **E-8** | Race conditions decided by server arrival timestamp | **Missing** | Server RPCs | Currently resolved by whichever client broadcast arrives first or evaluated locally. |
| **E-9** | `rooms.game_state` (JSONB) holds entire screen state (game, settings, round, turnOrder, public data, history) | **Partly met** | `supabase/setup.sql` (`rooms.game_state`), `src/pages/game/GameScreen.tsx` | Column exists in database, but is initialized to `{}` and never updated during gameplay. Clients maintain disjoint local React state. |
| **E-10** | Secrets in `round_secrets` table visible only to entitled player via RLS | **Partly met** | `supabase/setup.sql` (`round_secrets`) | Table and RLS policy exist in SQL, but games do not insert or query secrets through this table; secrets are currently bundled in client constants (`seed-content.ts`) or broadcast publicly. |
| **E-11** | `round_submissions` table for durable player submissions | **Missing** | `supabase/setup.sql` | Table does not exist in schema. Submissions are only transient WebSocket broadcast messages. |
| **E-12** | Canvas strokes and emoji clue persisted in DB (`round_strokes`, `game_state.clue`) | **Partly met** | `src/games/Pictionary.tsx`, `src/games/EmojiCharades.tsx` | `Pictionary` only broadcasts strokes; `EmojiCharades` only broadcasts clues. Refreshing wipes all drawings and clues. `round_strokes` table missing. |
| **E-13** | Client screen recovery from DB within 2s on refresh | **Missing** | `src/pages/game/GameScreen.tsx` | Refreshing `/room/:code/play` resets local component state back to Round 1 or countdown, desynchronizing from other players. |
| **E-14** | `heartbeat(room_id)` RPC every 10s; connected if `last_seen_at <= 25s` | **Partly met** | `src/pages/room/LobbyPage.tsx` | `LobbyPage` has an interval doing direct table update on `room_players`, but no `heartbeat` RPC exists, and `GameScreen` does not run heartbeat. |
| **E-15** | Disconnected players excluded from early-end; skipped after 10s absence | **Missing** | `src/games/*`, Server RPCs | Game components use raw `players.length` for early-end conditions. A disconnected player hangs the game. |
| **E-16** | Reconnecting player rejoins in same role or spectates | **Missing** | `src/pages/game/GameScreen.tsx` | No reconnection role recovery logic exists. |
| **E-17** | Late joiners become spectators with 0 points | **Partly met** | `supabase/setup.sql` (`join_room`) | `join_room` sets `is_spectator = true` if `status = 'in_game'`, but UI does not adapt in-game screens for spectators. |
| **E-18** | Game ends if < 2 connected participants remain | **Missing** | `src/pages/game/GameScreen.tsx`, Server RPCs | Games continue running even if all opponents disconnect. |
| **E-19** | Host migration preserved | **Met** | `supabase/setup.sql` (`leave_room`) | Host migration exists in `leave_room` RPC. Migrated host needs access to v2 controls. |
| **E-20** | Turn order shuffled and stored at game start | **Partly met** | `src/games/Pictionary.tsx`, `src/games/EmojiCharades.tsx` | Done client-side in React state independently on each client, causing turn order divergence between players! Must be stored in `rooms.game_state.turnOrder`. |
| **E-21** | Total rounds = `n x cycles` (range 1-3, default 2 if n <= 4, else 1) | **Missing** | `src/games/*` | Round counts are hardcoded constants (e.g. 5 rounds in Reaction Duel, 10 in Quiz, 1 in Typing and Word Chain). |
| **E-22** | Setup sheet shows estimated duration calculated from settings | **Missing** | `src/pages/room/LobbyPage.tsx` | No game setup sheet exists; clicking a game starts it immediately or sets selection without configuration. |
| **E-23** | Raw points ranking within each game | **Met** | `src/lib/scoring.ts` | Formulas exist for game-level points. Need adjustment for v2 multipliers and rules. |
| **E-24** | Arcade Points conversion (10, 7, 5, 4, 3, 2, 1; ties share best; spectators 0) | **Missing** | `src/lib/scoring.ts`, `src/pages/game/GameScreen.tsx` | Raw scores are dumped directly into `room_players.total_score`. No Arcade Points table or calculation exists. |
| **E-25** | Session standings table with Arcade Points breakdown and champion trophy | **Missing** | `src/components/ui/Podium.tsx`, `src/pages/game/GameScreen.tsx` | Only shows match scores; no per-game breakdown or session champion trophy screen. |
| **E-26** | Round half up; ties in raw points broken by earlier final scoring event | **Partly met** | `src/lib/scoring.ts` | Uses `Math.round` (round half up in JS for positive numbers), but does not break ties using earlier timestamp. |
| **E-27** | 2 to 3 superlative badges per game result screen | **Missing** | `src/components/ui/Podium.tsx` | No superlative badge calculation or rendering exists. |
| **E-28** | Content reservation in `room_content_used` before game start; pre-check shortage | **Partly met** | `supabase/setup.sql` (`room_content_used`) | Table exists in SQL, but `start_game` does not reserve content or pre-check shortages. |
| **E-29** | Bank exhausted notice with reset room history button | **Missing** | `src/pages/room/LobbyPage.tsx` | Not implemented in lobby or admin UI. |
| **E-30** | Required Server RPCs (`heartbeat`, `start_game`, `advance_phase`, `skip_phase`, `end_game`, `choose_word`, `skip_prompt`, `set_clue`, `save_strokes`, `submit_guess`, `submit_answer`, `submit_reaction`, `signal_go`, `submit_typing_result`, `submit_word`) | **Missing** | `supabase/setup.sql` | 12 out of 14 required RPCs are completely absent from `supabase/setup.sql`. |

---

## 3. Game Rules Overhaul (SRS v2 Section 3)

### 3.1 Reaction Duel ("Lightning Rounds")

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Rounds 5-10 (default 7). Presets: Quick 5, Standard 7, Long 10 | **Missing** | `src/games/ReactionDuel.tsx` | Hardcoded `totalRounds = 5`. No preset or host option support. |
| **Round Types** | Sequence: Classic, Decoy, Target modes | **Missing** | `src/games/ReactionDuel.tsx` | Only implements Classic (green screen). Decoy and Target modes are completely absent. |
| **Phases** | `intro` (2s), `wait` (up to 9.5s), `go` (2.5s / Target 3.5s), `result` (4.5s) | **Partly met** | `src/games/ReactionDuel.tsx` | States exist as local React strings (`ready`, `waiting`, `go`, `round_result`), but durations and phase transitions are uncoordinated and host-clicked. |
| **REA-1** | Director waits secret `go_delay` in `round_secrets`, calls `signal_go`. Clients turn green on DB change | **Missing** | `src/games/ReactionDuel.tsx` | Host client schedules a `setTimeout` and sends broadcast `go_signal`. No `round_secrets` storage, no `signal_go` RPC, no DB-driven green paint. |
| **REA-2** | Hardware timestamping via `requestAnimationFrame` and `submit_reaction` RPC | **Partly met** | `src/games/ReactionDuel.tsx` (line 83, line 157) | Uses `requestAnimationFrame` and `performance.now()`, but sends tap via broadcast instead of calling `submit_reaction` RPC. |
| **REA-3** | False start during wait/decoy -> 0 pts, "Too early!", lockout | **Partly met** | `src/games/ReactionDuel.tsx` | Detects false start on wait, but does not support decoy color false starts or server validation. |
| **REA-4** | Valid time range 80ms - 2,500ms (Target: 3,500ms) | **Partly met** | `src/lib/scoring.ts` (`computeReactionRoundScore`) | Checks 80ms to 3000ms. Needs Target 3500ms and server-side enforcement. |
| **REA-5** | Void rule: if no `signal_go` in 9.5s, void round and replay once, then skip | **Missing** | `src/games/ReactionDuel.tsx` | No void rule. If host delays, round waits indefinitely. |
| **REA-6** | Players refreshing during wait/go score 0 for that round | **Missing** | `src/games/ReactionDuel.tsx` | Refreshing resets the player's component or breaks synchronization. |
| **Scoring** | Points: 100, 80, 65, 50, 40, 30, 20. Target round worth x1.25 | **Partly met** | `src/lib/scoring.ts` | Base scale matches, but Target x1.25 multiplier is missing. |
| **Badges** | "Lightning", "Steady hand", "Comeback kid" | **Missing** | `src/games/ReactionDuel.tsx` | Superlative badges not calculated. |

---

### 3.2 Typing Race ("Type Rush")

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Rounds 1-5 (default 3), limit 60-120s (default 75s), presets | **Missing** | `src/games/TypingRace.tsx` | Single round only. Time limit not configurable. |
| **Content** | 1 passage per round with increasing difficulty (1, 2, 3+) reserved at start | **Missing** | `src/games/TypingRace.tsx` | Picks 1 random passage from `SEED_TYPING` in React state. No multi-round difficulty progression. |
| **Phases** | `intro` (3s), `typing` (limit), `result` (8s) | **Partly met** | `src/games/TypingRace.tsx` | Starts immediately on mount. No `intro` phase with blurred placeholder passage. |
| **TYP-1** | Clock starts at synced `typing` `started_at`, not first keypress | **Met** | `src/games/TypingRace.tsx` | Starts timer on mount using timestamp. |
| **TYP-2** | Single hidden input, exact matching, visible caret, correct spaces advance | **Partly met** | `src/games/TypingRace.tsx` | Hidden input used, but UI lacks distinct caret, error underline, and word marker advancement. |
| **TYP-3** | Block paste, drag, drop, autocorrect, autocomplete, suggestion bars (`beforeinput`) | **Partly met** | `src/games/TypingRace.tsx` | Lacks `beforeinput` / composition event blocking on mobile keyboards. |
| **TYP-4** | Last call: first finisher shortens remaining clock to `min(remaining, 20s)` | **Missing** | `src/games/TypingRace.tsx` | No last call countdown mechanism. |
| **TYP-5** | Lanes: avatar progress broadcast <= 4/s; finish flag and time | **Partly met** | `src/games/TypingRace.tsx` | Lanes exist and throttled at 250ms, but lacks finish flag with completion time. |
| **TYP-6** | `submit_typing_result` RPC with server E-6 recompute; reject >250 WPM or <chars*25ms | **Missing** | `src/games/TypingRace.tsx` | Client computes score locally and broadcasts `race_finished`. No RPC or server anti-cheat check. |
| **TYP-7** | Refresh restarts passage with clock running | **Partly met** | `src/games/TypingRace.tsx` | Refresh restarts component, but clock restarts as well instead of adhering to server `started_at`. |
| **Scoring** | Base: 100, 80, 65, 50, 35; <90% acc x0.75; 100% acc +15; DNF `round(20 + pct*0.3)`; Round 3+ x1.2 | **Partly met** | `src/lib/scoring.ts` (`computeTypingScore`) | Perfect accuracy bonus (+15) and Round 3+ multiplier (x1.2) are missing. |
| **Badges** | "Speed demon", "Sharpshooter", "Never gave up" | **Missing** | `src/games/TypingRace.tsx` | Not calculated. |

---

### 3.3 Quick Draw Quiz

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Questions 5-20 (default 10), 10-30s (default 15s), categories, penalty, jackpot, presets | **Missing** | `src/games/QuickDrawQuiz.tsx` | Hardcoded 10 questions and 15 seconds. No settings sheet or options support. |
| **Content** | Filtered by category, rising difficulty (1 -> 2 -> 3), reserved at start | **Missing** | `src/games/QuickDrawQuiz.tsx` | Client-side deterministic slice of `SEED_QUIZ`. No category filtering, difficulty progression, or DB reservation. |
| **Phases** | `intro` (1.5s), `answer` (limit), `reveal` (6s / Jackpot 8s) | **Partly met** | `src/games/QuickDrawQuiz.tsx` | Has answering and reveal state, but lacks 1.5s intro phase with question number and Jackpot badge. |
| **QZ-1** | Single-tap lock-in; shows "Locked in" with no correctness hint | **Met** | `src/games/QuickDrawQuiz.tsx` (lines 142-157) | Single-tap locks selection, disables other buttons, shows locked indicator. |
| **QZ-2** | `submit_answer` RPC returns only "locked" (never correctness); elapsed with E-6 | **Missing** | `src/games/QuickDrawQuiz.tsx` | Sends answer via broadcast `submit_quiz_answer`. Answer verified in client JavaScript against seed data. |
| **QZ-3** | Options in fixed random order per question (same for all players) | **Partly met** | `src/games/QuickDrawQuiz.tsx` | Options are displayed in static order from `SEED_QUIZ`. Server must shuffle options once and publish to `game_state`. |
| **QZ-4** | Jackpot questions on Q5, Q10, final (points doubled) | **Missing** | `src/games/QuickDrawQuiz.tsx` | No jackpot questions implemented. |
| **QZ-5** | Streak resets to 0 on wrong or missing answer | **Met** | `src/games/QuickDrawQuiz.tsx` (lines 183-189) | Streak counter increments on correct, resets to 0 on wrong. |
| **QZ-6** | Reveal: correct highlighted, explanation, option counts, fastest player, points + flame | **Partly met** | `src/games/QuickDrawQuiz.tsx` | Highlights correct answer, but does not show option counts, explanation, or fastest player time. |
| **QZ-7** | Every 5th question reveal shows full ranking for 3 extra seconds | **Missing** | `src/games/QuickDrawQuiz.tsx` | No periodic leaderboard view during reveal. |
| **Scoring** | Correct: `100 + round(100*(1-elapsed/limit)) + min(50, streak*10)`; wrong -25 if enabled; Jackpot x2 | **Partly met** | `src/lib/scoring.ts` (`computeQuizScore`) | Formula matches base quiz, but lacks Jackpot x2 multiplier and server-side execution. |
| **Badges** | "Know-it-all", "Quick draw", "On fire" | **Missing** | `src/games/QuickDrawQuiz.tsx` | Badges not calculated. |

---

### 3.4 Pictionary ("Sketch Showdown")

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Cycles 1-3, draw time 40-120s (default 80s), word choices on/off, presets | **Missing** | `src/games/Pictionary.tsx` | Hardcoded 80s, cycles not implemented. |
| **Content** | 3 words per round (easy, medium, hard) reserved at start | **Partly met** | `src/games/Pictionary.tsx` | Picks 3 random words from client seed, but lacks tiering (easy/med/hard) and DB reservation. |
| **Phases** | `choose` (12s), `draw` (time limit), `result` (7s) | **Partly met** | `src/games/Pictionary.tsx` | Has word selection and drawing, but lacks authoritative timer and automated phase transition. |
| **PIC-1** | Only drawer draws; 0..1 normalized coordinates; 3:2 fixed aspect ratio with letterboxing | **Partly met** | `src/games/Pictionary.tsx` | Normalized coordinates implemented, but canvas lacks 3:2 fixed aspect ratio container and letterboxing. |
| **PIC-2** | 8 colors (v2 palette), eraser, 3 brush sizes, undo last stroke, clear, fill bucket | **Partly met** | `src/games/Pictionary.tsx` | Palette uses v1 colors. Has eraser, clear, brush sizes, but lacks **undo last stroke** and fill bucket. |
| **PIC-3** | Streaming strokes batched 80-100ms with seq; `save_strokes` RPC every 3s | **Partly met** | `src/games/Pictionary.tsx` | Broadcasts strokes immediately without batching, seq numbers, or DB persistence via `save_strokes`. |
| **PIC-4** | Hints: 1 random letter at 40% time, another at 70% (max 40% of letters) | **Missing** | `src/games/Pictionary.tsx` | No automated letter hints. |
| **PIC-5** | `submit_guess` RPC (rate limit 800ms; normalize NFD, accents, plurals; returns correct/close/wrong) | **Partly met** | `src/lib/scoring.ts` (`evaluateGuess`) | Client has normalization and Levenshtein logic, but called in client without RPC, exposing secret word over broadcast. |
| **PIC-6** | Guess feed for wrong guesses; "Guessed" side channel for correct guessers | **Partly met** | `src/games/Pictionary.tsx` | Chat log displays all messages; lacks private "Guessed" side channel isolating correct guessers from non-guessers. |
| **PIC-7** | Drawer absent >10s ends round with 0 pts, skipped | **Missing** | `src/games/Pictionary.tsx` | If drawer leaves, game hangs on drawing screen. |
| **PIC-8** | Drawer cannot type guesses | **Met** | `src/games/Pictionary.tsx` | Input is hidden/disabled for active drawer. |
| **Scoring** | Difficulty `m` (1.0, 1.2, 1.4); Guesser formula; Drawer formula; Worked example: 292 | **Partly met** | `src/lib/scoring.ts` | Formulas exist in `scoring.ts`, but difficulty multipliers `m` are not applied. |
| **Badges** | "Picasso", "Mind reader", "Lightning guesser" | **Missing** | `src/games/Pictionary.tsx` | Badges not calculated. |

---

### 3.5 Emoji Charades

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Cycles 1-3, time 30-90s (default 60s), skips on/off, presets | **Missing** | `src/games/EmojiCharades.tsx` | Hardcoded 60s, no settings sheet or presets. |
| **Content** | 1 prompt + 1 spare per round reserved at start | **Missing** | `src/games/EmojiCharades.tsx` | Randomly picks 1 item from client seed. No spare prompt reserved for skips. |
| **Phases** | `compose` (time), `result` (6s) | **Partly met** | `src/games/EmojiCharades.tsx` | Compose and result exist, but transitions rely on client timer and host click. |
| **EMO-1** | Emoji-only field, categorized picker, recents row, delete button, max 20 emojis | **Partly met** | `src/games/EmojiCharades.tsx` | Has flat list of emojis, but lacks categorized picker, recents row, and 20 emoji cap. |
| **EMO-2** | Pictographic emojis only; reject letters, digits, punctuation, flags, letter-like emojis | **Missing** | `src/games/EmojiCharades.tsx` | No input validation against regional indicators, letters, or digits. |
| **EMO-3** | Clue streamed <= 4/s and persisted via `set_clue` <= 1/s in DB | **Partly met** | `src/games/EmojiCharades.tsx` | Broadcasts on every click without throttling or DB persistence via `set_clue`. |
| **EMO-4** | Hints: category visible, letter at 50% and 75% | **Partly met** | `src/games/EmojiCharades.tsx` | Category is displayed, but automated letter hints at 50% and 75% are missing. |
| **EMO-5** | Guessing follows PIC-5/6 (rate limit, close distance, guessed side channel) | **Partly met** | `src/games/EmojiCharades.tsx` | Client-side guess evaluation; lacks rate limit and separate side channel. |
| **EMO-6** | Skip once per round: swaps spare prompt, -25 pts, announced publicly | **Partly met** | `src/games/EmojiCharades.tsx` | Has skip button, but does not deduct 25 points or swap spare prompt from `round_secrets`. |
| **EMO-7** | Actor absent >10s ends round with 0 pts | **Missing** | `src/games/EmojiCharades.tsx` | No disconnect timeout handling. |
| **Scoring** | Same as Pictionary with `m = 1.0`; skip penalty -25 for actor | **Partly met** | `src/lib/scoring.ts` | Base scoring exists, but skip penalty not integrated into total. |
| **Badges** | "Emoji poet", "Fast reader", "Decoder" | **Missing** | `src/games/EmojiCharades.tsx` | Badges not calculated. |

---

### 3.6 Word Chain Blitz

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **Settings** | Rounds 1-5 (default 3), starting turn time 8-15s (default 12s), presets | **Missing** | `src/games/WordChainBlitz.tsx` | Only 1 round; hardcoded 10s turn time. |
| **Content** | Bundled dictionary + 200 starter words (4-6 letters) | **Partly met** | `src/data/dictionary.ts`, `src/games/WordChainBlitz.tsx` | Dictionary exists, but starter word is hardcoded ('arcade'). Needs 200 starter words pool. |
| **Round Twists** | Round 1 Classic (min 3, starts setting, shrinks 0.5s to 4s); Round 2 Long words (min 5, starts +3s, shrinks to 6s); Round 3 Speed (min 3, starts 7s, shrinks to 3s) | **Missing** | `src/games/WordChainBlitz.tsx` | Round twists not implemented. Only has single generic round. |
| **Phases** | `round_intro` (5s), `turn` (repeats), `round_result` (7s) | **Partly met** | `src/games/WordChainBlitz.tsx` | Turns repeat, but lacks `round_intro` with twist announcement and multi-round results. |
| **WCB-1** | Valid word: min length, letters only, starts with required letter, not used in round, in dictionary | **Partly met** | `src/games/WordChainBlitz.tsx` | Checked client-side against local dictionary. |
| **WCB-2** | `submit_word` RPC with specific reject reasons; timer keeps running; rate limit 400ms | **Missing** | `src/games/WordChainBlitz.tsx` | Submissions handled via broadcast and local state. No server RPC. |
| **WCB-3** | Turn timeout eliminates player for round; next player gets same required letter | **Partly met** | `src/games/WordChainBlitz.tsx` | Local client timer eliminates player; can desynchronize between clients. Needs server-authoritative elimination. |
| **WCB-4** | Eliminated players spectate and can Cheer | **Partly met** | `src/games/WordChainBlitz.tsx` | Eliminated players see UI disabled, but cheer reaction not implemented. |
| **WCB-5** | Round ends when 1 player remains or all remaining disconnected | **Met** | `src/games/WordChainBlitz.tsx` | Concludes round when `activePlayers.length <= 1`. |
| **WCB-6** | Fresh word list each round; eliminated status resets | **Missing** | `src/games/WordChainBlitz.tsx` | Single round only. |
| **WCB-7** | Scrolling chain list with highlighted join letters and avatars | **Partly met** | `src/games/WordChainBlitz.tsx` | Shows chain of words, but lacks highlighted join letters and avatars. |
| **WCB-8** | Dictionary load failure handling | **Met** | `src/games/WordChainBlitz.tsx` | Shows error banner if dictionary fails to load. |
| **WCB-9** | Disconnected skipped without elimination for 10s, then eliminated | **Missing** | `src/games/WordChainBlitz.tsx` | Disconnects not tracked in turn order. |
| **WCB-10** | "Challenge" button flags misses to `docs/dictionary-misses.json` | **Missing** | `src/games/WordChainBlitz.tsx` | Challenge button not implemented. |
| **Scoring** | 10 pts per word; placement: 100, 60, 40, 25, 15; longest word bonus +20 | **Partly met** | `src/lib/scoring.ts` (`computeWordChainScore`) | Placement bonus exists, but longest word bonus (+20) is missing. |
| **Badges** | "Wordsmith", "Survivor", "Quick thinker" | **Missing** | `src/games/WordChainBlitz.tsx` | Badges not calculated. |

---

## 4. Host Controls and Game Setup (SRS v2 Section 4)

| Requirement ID | Summary | Status | File & Function | Detailed Findings & Remediation |
|---|---|---|---|---|
| **HC-1** | Setup sheet on game selection with presets and estimated duration calculation | **Missing** | `src/pages/room/LobbyPage.tsx` | Clicking game selects it directly; no setup sheet, presets, or duration estimation. |
| **HC-2** | `start_game(room_id, game, options)` validates options, player count, and content | **Partly met** | `supabase/setup.sql` (`start_game`) | Function exists but does not validate options or check content reservations. |
| **HC-3** | In-game host overflow menu: Skip phase, End game, Kick player | **Missing** | `src/pages/game/GameScreen.tsx` | Host currently lacks in-game skip phase or end game menu. |
| **HC-4** | Post-game host choice: Play again, Pick another game, Back to lobby (no auto-start) | **Partly met** | `src/components/ui/Podium.tsx` | Has Play Again / Back to Lobby buttons, but lacks "Pick another game" flow. |
| **HC-5** | "Let the room vote" 15s timer, auto-resolves, default Standard preset | **Missing** | `src/pages/room/LobbyPage.tsx` | Has voting toggle, but no 15s voting phase or auto-start resolution. |

---

## 5. Visual System and Assets (SRS v2 Sections 5 & 6)

| Area | Requirement Summary | Status | Current Codebase State | Remediation Plan |
|---|---|---|---|---|
| **Colors** | "Golden hour on rooftop": Deep teal `--bg #0A2E36`, Marigold `--primary #FFB627`, Tangerine `#FF7A59`, Hot pink `#FF8FB8`, Lime `#B6E35B`, Sky `#5CC8FF`, Lilac `#B9A4FF`. Replace plum/bubblegum. | **Missing** | `tailwind.config.js` and `index.css` still use plum/bubblegum theme (`#181528`, `#FF5FA2`, `#9D4EDD`). | Update CSS variables and Tailwind theme to Section 5.2 tokens. |
| **Typography** | Bricolage Grotesque (headings), DM Sans (body), Atkinson Hyperlegible (typing & numerals) | **Missing** | `index.html` loads Outfit and Plus Jakarta Sans. | Replace Google Font imports with Bricolage Grotesque, DM Sans, and Atkinson Hyperlegible. |
| **Shapes & Cards** | Hard-shadow tiles: `border: 2px solid`, `border-radius: 12-16px`, solid offset box shadow `4px 4px 0 var(--shadow)`. No glassy blur. | **Missing** | UI currently uses rounded cards with soft `shadow-xl`, `backdrop-blur-md`, and pill buttons. | Re-style Button, Input, Modal, and Card components to hard-shadow tile system. |
| **Images** | Cut-paper collage style: 20 animal avatars (`avatar-01.webp`..`20`), 6 game covers, `hero-skyline.webp`, empty-lobby, waiting, celebrate, offline, 404, sound-off, SVG logo mark/wordmark. | **Missing** | `public/art/` directory does not exist. App currently uses emoji avatars or generic placeholders. | Generate or author assets in `public/art/` matching Section 6 brief and create `src/art/manifest.ts`. |

