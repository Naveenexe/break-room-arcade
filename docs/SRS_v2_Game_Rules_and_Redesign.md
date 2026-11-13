# Break Room Arcade: SRS v2 (Game Rules, Round Engine, Visual Refresh)

Version 2.0 | Date: 14 November 2026 | Audience: the AI coding agent (Google Antigravity) and the project owner

**Relationship to v1.** This document **replaces** these parts of SRS v1: Section 3.1 principle P4, Section 6.2, all of Section 7.3 to 7.9 (shared game rules and the six games), all of Section 9 (visual design) and Appendix C (images). Everything else in v1 stays valid: accounts, profile, rooms, lobby, password rules, content bank, admin pages, security rules, clock sync (TM-1 to TM-5), free-tier limits, deployment steps and the testing approach. Where v1 and v2 disagree, **v2 wins**.

---

## 0. Instructions to the agent (read first)

1. **Audit before you change anything.** Read `PROJECT_REPORT.md`, the SRS v1, and this document. Then read the actual codebase and produce `docs/GAP_ANALYSIS.md`: a table of every requirement in Sections 2 and 3 of this document, marked Met, Partly met or Missing, with the file and function where it is (or should be). Do not start coding until the owner has seen the gap analysis and the fix plan.
2. **Fix the engine first, then games one at a time** in the order given in Section 8. A game is not finished until its automated multi-player test passes (Section 7).
3. The previous build was reported as fully "Delivered" while the games lacked core logic. This time, **never mark anything done on the basis of code existing.** Only a passing test, or a documented manual run with 4 browser sessions, counts. Report failures plainly.
4. Everything in Sections 2 and 3 is mandatory. Numbers given are defaults; the host can change them within the stated ranges.
5. Never invent keys or credentials. Stop at any step only the owner can do and give a numbered, click-by-click checklist (v1 Section 11 rules still apply).
6. For images, follow Section 6. Generate them with your image tool and save them in `public/art/` with the file names given.

---

## 1. What was wrong with the first build

These defects were identified from `PROJECT_REPORT.md`. The agent MUST verify each in the code and fix it.

| # | Defect (as it appears in the report) | Why it breaks the games | Required fix |
|---|---|---|---|
| D1 | Rounds advance when the **host clicks** ("Start Round", "advance_round", "next_question") | Game stalls if the host is slow, leaves, or refreshes. v1 P4 said anyone may advance an expired phase. | Section 2.3: every phase has a deadline and advances **automatically**. The host never has to click to continue. |
| D2 | Game events travel only as **Broadcast** messages | A refresh or late join loses the whole state. Missed messages freeze players on an old screen. | Section 2.5: the state of record lives in the database; broadcast is only for high-frequency extras. |
| D3 | The implemented RPC list has **no** `submit_guess`, `submit_answer`, `submit_word`, `submit_reaction`, `advance_phase` | Answers are being checked in the browser, so correct answers and secret words can be read by any player and scores can be faked. | Section 2.10: all validation and scoring happen in RPCs. |
| D4 | Reaction waits for "All Taps Collected" | If one person never taps or disconnects, the round never ends. | Every wait has a hard deadline (Section 3.1). |
| D5 | Games are effectively **one round or one match** | Games feel unfinished; no build-up, no comeback, no rhythm. | Every game is multi-round with a defined round structure (Section 3). |
| D6 | Raw game scores are added straight into the room total | A quiz (up to 2,500 points) drowns a reaction game (about 500). The session winner is decided by whichever game has bigger numbers. | Section 2.8: games award **Arcade Points** by placement. |
| D7 | `room_players` is readable with `USING (true)` for `anon` and `authenticated` | Anyone, even without an account, can list who is in every room. | Replace with a non-recursive `SECURITY DEFINER` helper `is_room_member(room_id)` and policies that use it; `anon` gets nothing. |
| D8 | `start_game(p_room_id, p_game)` has no options argument | Hosts cannot set round counts, timers or categories. | `start_game(room_id, game, options jsonb)` with validation (Section 4). |
| D9 | Disconnected players are handled only by client presence | A frozen tab can block "everyone has answered" logic. | Server-side `heartbeat` (Section 2.6). |

---

## 2. Session and Round Engine (applies to all games)

### 2.1 Structure
```
Session (the room's whole evening)
  Game (e.g. Pictionary)           chosen by host or vote
    Round (e.g. "Round 3 of 8")    a turn, a question, a race
      Phase (e.g. "draw")          has a deadline
```
A session has many games. A game has many rounds. A round has 2 to 4 phases. All of it is defined by the tables in Section 3.

### 2.2 Phase contract
Every phase has: `name`, `started_at`, `ends_at` (server UTC), `version`, an **ends-when** condition and an **on-enter** effect (what the server does when the phase begins). Clients render only from `rooms.phase`, `rooms.game_state`, `ends_at` and their own private data.

### 2.3 Advancing phases (replaces v1 P4)
- **E-1** A phase ends at `ends_at`, or earlier if its early-end condition is true (for example "all connected players have answered").
- **E-2** `advance_phase(room_id, expected_version)` may be called by **any connected player in the room**. The server acts only if the version matches and either `now() >= ends_at` or the early-end condition is true. It is **idempotent**: duplicate calls do nothing.
- **E-3** Clients call it after the countdown hits zero plus a random delay of 0.2 to 0.8 seconds, so that one call usually wins and the rest are no-ops. If the call fails, retry up to 3 times at 1-second intervals.
- **E-4** The host has no required clicks during a game. The host can (a) start a game, (b) press "Skip" to end the current phase early, (c) end the game early, and (d) choose what happens after the game result.
- **E-5** Watchdog: if a phase is more than 5 seconds past `ends_at` and still unchanged, every client calls `advance_phase` again every 2 seconds. A game must never remain stuck.

### 2.4 Latency fairness
- **E-6** Time-based scores use the player's measured elapsed time from the synced clock, **clamped** to a window of the server's own measurement: `elapsed_used = clamp(client_elapsed, server_elapsed - 600 ms, server_elapsed)`. A player cannot claim to have been faster than the server saw by more than 600 ms, and a high-latency player is not punished for network delay beyond what the server measured.
- **E-7** Submissions arriving after `ends_at` are accepted if `arrival_time <= ends_at + min(client_rtt/2, 400 ms)`; otherwise rejected as late.
- **E-8** When a submission and the deadline race (word chain, quiz), the server decides by arrival timestamp using E-7.

### 2.5 Persistence and recovery
- **E-9** `rooms.game_state` (JSONB) holds everything needed to redraw the current screen: game key, settings, round number and total, turn order, the current round's public data, and a `history` array of finished rounds with their scores.
- **E-10** Secrets (word to draw, charades prompt, quiz correct index, reaction delay) live in `round_secrets` and are visible only to the entitled player (or to nobody; see game sections).
- **E-11** Player submissions that matter (quiz answers, reaction taps, typing results, guesses) are rows in a `round_submissions` table (`room_id, round_no, user_id, kind, payload, arrived_at`) written by RPCs, so a refresh restores "you already locked in".
- **E-12** Canvas strokes and the emoji clue are persisted too (`round_strokes`, `game_state.clue`), see Sections 3.4 and 3.5.
- **E-13** After any refresh, reconnect or second tab, the client rebuilds the screen from the database within 2 seconds, with no user action.

### 2.6 Presence, disconnects, late joiners
- **E-14** Each client calls `heartbeat(room_id)` every 10 seconds. A player is **connected** if `last_seen_at` is within the last 25 seconds. The server uses this (not client presence) for every "all players have..." check.
- **E-15** A player who is disconnected is excluded from early-end conditions immediately, shown greyed out, and is skipped in turn order after 10 seconds of absence. Their points so far stay on the board.
- **E-16** A player who reconnects rejoins the same game in the same role if their slot has not yet passed; otherwise they spectate until the next round that suits them.
- **E-17** Players who join after a game has started are **spectators** for that game and receive no points for it. They see the live game.
- **E-18** If fewer than 2 connected participants remain, the game ends and shows results so far. (Testing mode still requires at least 2.)
- **E-19** Host migration (v1 TM-8) still applies. A migrated host inherits only the rights in E-4.

### 2.7 Turn order and round counts
- **E-20** For turn-based games (Pictionary, Emoji Charades), at game start the server shuffles connected participants into `turn_order` and stores it. Round `r` is performed by `turn_order[(r - 1) mod n]`.
- **E-21** Total rounds = `n x cycles`, where `cycles` defaults to 2 when n is 4 or fewer, otherwise 1; host range 1 to 3. The total is fixed at game start. If a person's slot arrives while they are disconnected for over 10 seconds, that round is skipped (it still counts toward the total, shown as "skipped").
- **E-22** The setup sheet shows the **estimated duration** computed from the settings (Section 4) so the host knows how long the game takes.

### 2.8 Scoring layers
- **E-23** Inside a game, players earn **raw points** (formulas per game). Raw points decide the ranking **within that game**.
- **E-24** When a game ends, each participant receives **Arcade Points** by rank, added to the session standings:

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Arcade Points | 10 | 7 | 5 | 4 | 3 | 2 | 1 |

Tied players share the points of the best tied rank. A participant who stayed in at least one round gets at least 1. Spectators get 0.
- **E-25** The **session standings** show Arcade Points with a per-game breakdown. The **session champion** is the leader when the host closes the session, with a trophy screen.
- **E-26** Rounding is always **round half up**. Ties in raw points are broken by the earlier time of the final scoring event.
- **E-27** Every game result screen shows 2 to 3 **superlative badges** (listed per game) in addition to the ranking.

### 2.9 Content handling
- **E-28** Before a game starts, `start_game` reserves content for **all rounds** (see "Content needed" per game) and records it in `room_content_used`, so the same room never repeats an item and a shortage is caught **before** the game begins with a clear message ("Needs 18 Pictionary words, only 12 unused available").
- **E-29** If a room has used the entire bank, the host sees "You have played everything. Import more content or reset this room's history" with a reset button.

### 2.10 Required RPCs (all `SECURITY DEFINER`, validating the caller's membership and role)
`heartbeat`, `start_game(room_id, game, options)`, `advance_phase(room_id, expected_version)`, `skip_phase` (host), `end_game` (host), `choose_word` (drawer), `skip_prompt` (actor), `set_clue` (actor), `save_strokes` (drawer), `submit_guess`, `submit_answer`, `submit_reaction`, `signal_go` (reaction director), `submit_typing_result`, `submit_word`. Each returns only what that caller is allowed to know (for example `submit_guess` returns `correct`, `close` or `wrong`, never the word).

### 2.11 Shape of `game_state` (guide; refine as needed)
```json
{
  "game": "quiz",
  "settings": {"rounds": 10, "timeLimit": 15},
  "round": 4,
  "totalRounds": 10,
  "turnOrder": ["uid1", "uid2"],
  "participants": ["uid1", "uid2", "uid3", "uid4"],
  "current": { "public": "data for this round, never secrets" },
  "raw": {"uid1": 640, "uid2": 510},
  "history": [{"round": 1, "points": {"uid1": 180, "uid2": 0}}]
}
```

---

## 3. The six games

Common to all games: a how-to-play card (8 s, skippable, shown before the first round); a synced 3-2-1 start; a round banner ("Round 3 of 8") before each round; a thin progress strip of rounds; a player strip with live raw scores; a result screen after each round; and a game result screen (podium, ranking, superlative badges, Arcade Points gained) lasting at least 10 seconds before the host chooses "Play again", "Pick another game" or "Back to lobby". All text on screen uses sentence case.

---

### 3.1 Reaction Duel ("Lightning Rounds")

**Idea.** Everyone reacts at the same moment. Three round types keep it fresh across rounds.

**Settings.** Rounds 5 to 10 (default 7). Presets: Quick 5, Standard 7, Long 10.

**Content needed.** None.

**Round types and order.** Sequence for 7 rounds: Classic, Classic, Decoy, Target, Classic, Decoy, Target. For other counts, repeat the pattern `Classic, Decoy, Target` and make round 1 always Classic.

| Type | What happens | Valid action |
|---|---|---|
| Classic | Calm amber screen "Wait for green…" then full-screen green "Tap now!" | Tap anywhere after green |
| Decoy | During the wait, the screen flashes other colors (blue, pink, purple) at random. Only **green** is the signal. | Tap after green; tapping on any decoy color is a false start |
| Target | After the signal, a round target appears at a random position; the screen background is already green. | Tap **inside** the target; taps outside it are ignored (small shake) |

**Phases**

| Phase | Duration | On-enter (server) | Ends when |
|---|---|---|---|
| `intro` | 2 s | Pick round type; store `go_delay` (random 2.0 to 7.0 s) in `round_secrets` readable only by the **director** (the host, or if absent the earliest-joined connected player) | Timer |
| `wait` | up to 9.5 s hard cap | none | The director calls `signal_go`, or the 9.5 s cap passes (see void rule) |
| `go` | 2.5 s (Target: 3.5 s) | `signal_go` sets this phase and, for Target, a random `target` position and radius | All connected participants have tapped or false-started, or timer ends |
| `result` | 4.5 s | Compute ranks and points, write `history` | Timer |

**Rules**
- **REA-1** The director's client waits its secret `go_delay` after the `wait` phase begins, then calls `signal_go`. The server checks `now() >= wait_started + go_delay - 150 ms` and moves to `go`. Every client, including the director's, turns green only when the **database change arrives**, so no one has an advantage.
- **REA-2** Reaction time = `performance.now()` at tap minus `performance.now()` when the green frame was painted (use `requestAnimationFrame` after the state change). Submit with `submit_reaction(room, round, ms, kind)`, where `kind` is `tap` or `false_start`.
- **REA-3** A false start is any tap while the phase is `wait` (including during decoy flashes). It scores 0 for the round and the player sees "Too early!" and is locked out until the next round.
- **REA-4** Valid time range: 80 ms to 2,500 ms (Target: 3,500 ms). Under 80 ms counts as a false start. No tap in time scores 0 ("No tap").
- **REA-5** **Void rule:** if no `signal_go` arrives within 9.5 s (for example the director left), the round is voided and replayed once as the same type. If it fails again, the round is skipped with the message "Signal lost, skipping round".
- **REA-6** Players who refresh during `wait` or `go` score 0 for that round only.

**Scoring (raw points per round, by rank of valid times, fastest first)**

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7+ valid | False start / no tap |
|---|---|---|---|---|---|---|---|---|
| Points | 100 | 80 | 65 | 50 | 40 | 30 | 20 | 0 |

Equal times (same millisecond) share the better rank. Target rounds are worth **x1.25** (rounded half up). Game raw total = sum of rounds.

**Result screens.** Round result: ranked horizontal bars in milliseconds, avatars, personal best marker, a red cross and "Too early" on false starts. Game result: total, average and best time per player.

**Superlative badges.** "Lightning" (best single time), "Steady hand" (zero false starts and at least 3 valid taps), "Comeback kid" (biggest rank improvement from the first half to the second half).

**Edge cases.** Tie for first: both get the rank-1 points. Only one valid tapper: that player gets rank 1. Everyone false-starts: everyone scores 0 and the round result says "Nobody got it. Wow."

---

### 3.2 Typing Race ("Type Rush")

**Idea.** A short series of races on passages that get harder, with live race lanes.

**Settings.** Rounds 1 to 5 (default 3). Time limit per race 60 to 120 s (default 75). Presets: Quick 2 rounds, Standard 3, Long 5.

**Content needed.** One typing passage per round, increasing difficulty: round 1 difficulty 1, round 2 difficulty 2, round 3 and beyond difficulty 3 (or the highest available). Reserved at game start.

| Phase | Duration | On-enter | Ends when |
|---|---|---|---|
| `intro` | 3 s | Show round banner and the lanes; passage is **hidden** (blurred placeholder) | Timer |
| `typing` | limit (default 75 s) | Publish the passage in `game_state`; set `race_started_at` | All connected participants finished or timed out; or **last call** (below) |
| `result` | 8 s | Compute stats, ranks, points | Timer |

**Rules**
- **TYP-1** The clock starts at `typing` `started_at` for everyone (synced), not at the first key press.
- **TYP-2** Input is one hidden field that captures every character. Errors are allowed while typing but are highlighted (underline plus color); the player finishes only when the typed text **exactly matches** the passage. A visible caret marks the next character. Correct spaces advance the word marker.
- **TYP-3** Paste, drop, drag, autocorrect, autocomplete and suggestion bars are blocked (`autocomplete=off`, `autocorrect=off`, `autocapitalize=off`, `spellcheck=false`, handle `beforeinput` and composition events so mobile keyboards cannot insert whole words).
- **TYP-4** **Last call:** when the first player finishes, the remaining time for everyone else becomes `min(remaining, 20 s)`. The lanes show "Last call: 20 s".
- **TYP-5** Lanes: each avatar moves along a lane in proportion to progress (correct characters / passage length). Progress is broadcast at most 4 times per second, only when it changed. A finished player's avatar gets a flag and their time.
- **TYP-6** Submit results with `submit_typing_result(room, round, {chars_typed, keystrokes, correct_keystrokes, finished, finished_at_client})`. The server recomputes elapsed time from `typing` start and its arrival time (E-6) and rejects results above 250 WPM or with an elapsed time below `chars x 25 ms`.
- **TYP-7** A player who refreshes mid-race restarts the passage from the beginning with the clock still running. This is allowed; nothing is lost except their progress.

**Formulas**
- Net WPM = (correct characters / 5) / (elapsed seconds / 60). Example: a 150-character passage finished in 45 s with no errors is (150 / 5) / 0.75 = **40 WPM**.
- Accuracy = correct keystrokes / total keystrokes.

**Scoring per round (raw)**

| Finishing place | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|
| Base | 100 | 80 | 65 | 50 | 35 |

If accuracy is under 90%: points x 0.75 (round half up). **Perfect bonus:** +15 for 100% accuracy. **Did not finish:** `round(20 + progress_percent x 0.3)`. Round 3 and later are worth x1.2.

**Superlative badges.** "Speed demon" (highest WPM of any round), "Sharpshooter" (best accuracy over the game), "Never gave up" (finished every round).

**Edge cases.** Two players finishing in the same millisecond: same place and base points. Everyone fails to finish: ranks by progress. Passage identical for everyone in a round; different each round.

---

### 3.3 Quick Draw Quiz

**Idea.** Fast multiple choice with streaks and jackpot questions.

**Settings.** Questions 5 to 20 (default 10). Seconds per question 10 to 30 (default 15). Categories (multi-select, default all). Wrong-answer penalty off/on (default off). Jackpot questions on/off (default on). Presets: Quick 6, Standard 10, Long 15.

**Content needed.** One quiz question per round, filtered by chosen categories. Reserved at game start. Difficulty rises: first third mostly 1, middle 2, last third 2 and 3 where available.

| Phase | Duration | On-enter | Ends when |
|---|---|---|---|
| `intro` | 1.5 s | Show "Question 4 of 10", category chip, and a **Jackpot** badge when applicable | Timer |
| `answer` | limit (default 15 s) | Publish question and the 4 options in `game_state` (never the correct index) | All connected participants locked in, or timer |
| `reveal` | 6 s (Jackpot 8 s) | Server computes points, writes correct index, option counts and per-player result to `game_state`; shows mini standings | Timer |

**Rules**
- **QZ-1** A player chooses one option and locks in with a single tap (or taps then confirms in a setting; default is tap to lock). After locking, the UI shows "Locked in" with no hint of correctness. Locking cannot be changed.
- **QZ-2** `submit_answer(room, question_no, choice, client_elapsed_ms)` stores the answer and returns only "locked" (never correctness). Elapsed time is processed with E-6.
- **QZ-3** Options are shown in a **fixed random order per question** that is the same for every player (shuffled once by the server).
- **QZ-4** **Jackpot** questions are number 5, number 10 and the final question (when jackpot is on and the quiz has at least 6 questions). Points on a jackpot are doubled.
- **QZ-5** **Streak:** consecutive correct answers. A wrong or missing answer resets the streak to 0.
- **QZ-6** The reveal shows: the correct option highlighted, a one-line explanation if available, how many players picked each option, the fastest correct player with time, and each player's points gained with a streak flame icon.
- **QZ-7** Every 5th question the reveal also shows the full ranking for 3 extra seconds.

**Scoring (raw per question)**
- Correct: `100 + round(100 x (1 - elapsed / limit)) + min(50, streak_before x 10)` where `streak_before` is the streak count **before** this answer.
- Wrong: 0, or -25 if the penalty is on (the total never goes below 0).
- No answer: 0.
- Jackpot: multiply the result by 2.
- **Worked example:** limit 15 s, answered correctly at 3.0 s with a prior streak of 2: `100 + round(100 x 0.8) + 20 = 200`. On a jackpot: 400.

**Superlative badges.** "Know-it-all" (most correct), "Quick draw" (fastest average correct time), "On fire" (longest streak).

**Edge cases.** Nobody answers: reveal shows "Nobody knew it" with the correct answer. Elapsed time exactly equal for two players: tie, both get the same points. Quiz needs at least 5 reserved questions or it does not start.

---

### 3.4 Pictionary ("Sketch Showdown")

**Idea.** Players take turns drawing; everyone else guesses fast. Every player draws.

**Settings.** Cycles 1 to 3 (default per E-21). Draw time 40 to 120 s (default 80). Word choices on/off (default on). Presets: Quick (50 s draw, 1 cycle), Standard (80 s), Long (100 s, 2 cycles).

**Content needed.** 3 words per round (one easy, one medium, one hard, by difficulty field). If the bank lacks a tier, fill from the nearest tier. Reserved for all rounds at game start.

| Phase | Duration | On-enter | Ends when |
|---|---|---|---|
| `choose` | 12 s | Drawer is `turn_order[(round-1) mod n]`. Server writes the 3 words to `round_secrets` visible **only** to the drawer. Others see "Asha is choosing a word" | Drawer calls `choose_word`, or timer (server auto-picks the medium word) |
| `draw` | draw time (default 80 s) | Mask `_ _ _ _ _` with letter count (spaces shown) published; the chosen word stays in `round_secrets`. Canvas cleared | All connected non-drawer participants guessed correctly, or timer, or drawer absent over 10 s |
| `result` | 7 s | Reveal the word, show points per player, the final drawing and "Drawer earned X" | Timer |

**Rules**
- **PIC-1** Only the drawer can draw. The canvas is the same normalized space for everyone: strokes use x, y in 0 to 1. All devices render at their own size with a fixed 3:2 aspect ratio. The drawer's canvas letterboxes if the window is narrow.
- **PIC-2** Tools: 8 colors from the palette (Section 5), eraser, 3 brush sizes, **undo last stroke**, **clear**. **Fill bucket** is a SHOULD (queue-based flood fill performed on drawer's canvas, then sent as a fill command with its seed point and color so others replay it).
- **PIC-3** Streaming: strokes are simplified and batched every 80 to 100 ms, each batch numbered with a sequence. Receivers detect gaps and request the missing range. Every 3 seconds the drawer calls `save_strokes` to store the batches since the last save. A refresh, reconnect or late joiner loads the saved strokes plus live batches, so a drawer who refreshes keeps their drawing.
- **PIC-4** **Hints:** one random letter is revealed at 40% of draw time elapsed and another at 70% (never more than 40% of the letters). Each hint reduces the points available to later guessers through the formula (it is already in the time term, no extra penalty).
- **PIC-5** Guessing: a text input sends `submit_guess`. Rate limit: one guess per 800 ms per player. The server normalizes both strings (Unicode NFD, strip accents, lowercase, remove punctuation and extra spaces, drop leading "a", "an", "the", accept simple plurals "s" and "es") and returns `correct`, `close` or `wrong`. `close` means edit distance 1 for words of 5 or more letters or exact match after reordering words; it shows a private "So close!" only to that guesser.
- **PIC-6** Wrong guesses appear in a public guess feed (so friends can see funny attempts). A correct guess shows "Ravi got it!" to everyone and hides the word. A player who has guessed correctly can chat only in a "Guessed" side channel visible to other correct guessers and the drawer, never to those still guessing.
- **PIC-7** If the drawer is absent for over 10 seconds, the round ends with no points, the message "Drawer disconnected. Round skipped" and their turn is not replayed.
- **PIC-8** The drawer cannot type guesses.

**Scoring (raw per round)**
- Word difficulty multiplier `m`: easy 1.0, medium 1.2, hard 1.4 (round half up after applying).
- Guesser: `round((100 + round(150 x remaining / total) + order_bonus) x m)` where `order_bonus` is +30 first, +20 second, +10 third correct, else 0.
- Drawer: `round(min(300, 50 x correct_guessers) + (50 if everyone guessed)) x m)`.
- No one guesses: guessers 0, drawer 0.
- **Worked example:** 80 s round, medium word (m = 1.2), first guess when 60 s remain: `round((100 + round(150 x 60/80) + 30) x 1.2) = round((100 + 113 + 30) x 1.2) = round(291.6) = 292`.

**Superlative badges.** "Picasso" (most total guesses on their drawings), "Mind reader" (most correct guesses), "Lightning guesser" (fastest correct guess).

**Edge cases.** Everyone guesses before time: the round ends early. Drawer picks a hard word and nobody guesses: no points (the risk is part of the game). A guess that equals the word typed by a non-guesser while drawer is absent is irrelevant (round ended).

---

### 3.5 Emoji Charades

**Idea.** The actor communicates a secret phrase using only emojis; everyone else guesses. Every player takes a turn.

**Settings.** Cycles 1 to 3 (default per E-21). Time per round 30 to 90 s (default 60). Skips on/off (default on). Presets: Quick (40 s), Standard (60 s), Long (75 s, 2 cycles).

**Content needed.** One prompt per round plus one spare per round for skips (so 2 x rounds reserved). Categories selectable.

| Phase | Duration | On-enter | Ends when |
|---|---|---|---|
| `compose` | time (default 60 s) | Actor is `turn_order[(round-1) mod n]`. The prompt is written to `round_secrets` visible **only** to the actor. Public state shows category, number of words and a letter mask | Everyone (not the actor) guessed correctly, or timer, or actor absent over 10 s |
| `result` | 6 s | Reveal the prompt, points per player, final clue | Timer |

**Rules**
- **EMO-1** The actor builds the clue in an emoji-only field with a categorized emoji picker, a recents row and a delete button. Maximum **20** emojis per clue. The clue can be edited freely at any time.
- **EMO-2** **Allowed:** pictographic emojis, skin-tone modifiers, flags are **not** allowed. **Not allowed:** letters, digits, punctuation, letter-like emojis (the 🅰️ 🅱️ 🆎 🔤 🔠 family, keycap digits, regional indicator letters). The field rejects them with a gentle message ("Emojis only, no letters").
- **EMO-3** The clue streams live to everyone (throttled to about 4 per second) and is also stored via `set_clue` at most once per second so it survives refreshes.
- **EMO-4** Hints: category is always visible. A letter is revealed at 50% and again at 75% of time.
- **EMO-5** Guessing, matching, "So close!", the guess feed, rate limit, the "Guessed" side channel and early end follow PIC-5 and PIC-6.
- **EMO-6** **Skip:** the actor may skip once per round. It swaps in the spare prompt and **resets nothing but costs 25 points** (raw total never drops below 0). The skip is announced publicly as "Actor skipped" (without revealing the prompt).
- **EMO-7** Actor absence over 10 seconds ends the round with no points (as PIC-7).

**Scoring (raw per round).** Same formulas as Pictionary with `m = 1.0` for all prompts. Skip penalty -25 for the actor.

**Superlative badges.** "Emoji poet" (most total correct guesses on their clues), "Fast reader" (fastest correct guess), "Decoder" (most correct guesses).

**Edge cases.** The actor types an extra long clue: capped at 20. A guess that matches the prompt when typed with emojis only: letters are required, so emoji guesses are ignored and show a hint "Type your guess in words".

---

### 3.6 Word Chain Blitz

**Idea.** An elimination duel that repeats over several rounds, with a new twist each round.

**Settings.** Rounds 1 to 5 (default 3). Starting turn time 8 to 15 s (default 12). Presets: Quick 2 rounds, Standard 3, Long 5.

**Content needed.** None from the bank; a bundled dictionary (v1 CB-6) and a short list of 200 **starter words** (common 4-to-6-letter words) shipped with the app.

**Round twists** (cycle in this order if more than 3 rounds):

| Round | Name | Rule |
|---|---|---|
| 1 | Classic | Minimum word length 3. Turn time starts at the setting, shrinks 0.5 s per valid word to a minimum of 4 s |
| 2 | Long words | Minimum word length 5. Turn time starts 3 s higher than the setting, shrinks 0.5 s per valid word, minimum 6 s |
| 3 | Speed | Minimum word length 3. Turn time starts at 7 s, shrinks 0.5 s per valid word, minimum 3 s |

| Phase | Duration | On-enter | Ends when |
|---|---|---|---|
| `round_intro` | 5 s | Show the round name and its twist; server picks a random **starter word** (not counted as anyone's) and fixes turn order | Timer |
| `turn` (repeats) | current turn time | Active player is the next surviving player in `turn_order`; required first letter = last letter of the previous word (starter word first) | A valid word arrives, or time out |
| `round_result` | 7 s | Compute placements and points | Timer |

**Rules**
- **WCB-1** Valid word: at least the round's minimum length, letters only, begins with the required letter, **not used earlier in this round** (including the starter word), and found in the dictionary.
- **WCB-2** Submitting a word calls `submit_word`. If it is rejected the player sees the **specific reason** ("Not in my dictionary", "Already used", "Must start with R", "Needs 5+ letters") and **their timer keeps running**. Rate limit: one submission per 400 ms.
- **WCB-3** If the turn time runs out the player is **eliminated** for the rest of this round, an animation plays, and the turn passes to the next surviving player with the **same required letter**. E-8 decides races between a late word and the deadline.
- **WCB-4** Eliminated players spectate (they see the chain growing and can use a "Cheer" emoji reaction).
- **WCB-5** The round ends when **one player remains**, or when all remaining players are disconnected (the last connected player wins).
- **WCB-6** Players start every round with a fresh word list. Eliminated status does not carry over to the next round.
- **WCB-7** A scrolling chain list shows each word with the joining letters highlighted and the player's avatar.
- **WCB-8** If the dictionary fails to load, the game does not start and offers a retry.
- **WCB-9** Disconnected players are skipped without elimination for the first 10 seconds, then eliminated.
- **WCB-10** The dictionary is only used for deciding validity. An imperfect dictionary will reject a few real words; the **"Challenge" button** lets the player whose word was rejected and the host see it flagged to `docs/dictionary-misses.json` for later review (no vote, no effect on the current round).

**Scoring (raw per round)**
- Per valid word: **10 points**.
- Placement bonus: winner 100, second-to-last eliminated 60, then 40, 25, 15 for all others.
- **Longest word bonus:** +20 to the player with the longest valid word that round (ties split by earlier submission).
- Game raw total = sum of rounds.

**Superlative badges.** "Wordsmith" (longest word of the game), "Survivor" (most rounds won), "Quick thinker" (fastest average submit time).

**Edge cases.** Two players remain and both time out simultaneously: the one whose deadline passed first loses (server timestamp). A single starter word with a very rare last letter (X, Q, Z): the server never picks a starter or word-chain letter from this set as the required letter; if a chain reaches Q, X, Z or J as a last letter and the player fails, the round continues normally (that is the game).

---

## 4. Host controls and game setup

- **HC-1** Choosing a game opens a **setup sheet** with that game's settings, presets (Quick, Standard, Long), and an **estimated duration** such as "About 9 minutes". Duration = sum of phase durations over all rounds, assuming each phase runs to its limit (recalculated live as settings change).
- **HC-2** `start_game(room_id, game, options)` validates the options against the ranges in Section 3, checks player count (min 4, or 2 in Testing mode), checks content availability (E-28) and returns a precise error message on failure.
- **HC-3** During the game the host sees an overflow menu: **Skip** (ends the current phase early), **End game** (shows results so far), **Kick player**.
- **HC-4** After the game result, the host chooses next steps. If the host does nothing, the room stays on the result screen (no auto-start).
- **HC-5** "Let the room vote" runs for 15 s, auto-resolves, shows the votes, and uses default settings (Standard preset).

---

## 5. Visual redesign (replaces v1 Section 9)

### 5.1 Concept: "Golden hour on the office rooftop"
Warm sunset energy over a deep teal night. A sunny, social feel rather than a neon arcade. Surfaces are calm and dark teal so gameplay stays readable; marigold is the hero color; each game gets its own accent. The memorable elements: **hard-shadow tiles** (flat panels with a solid offset shadow, like paper cards on a table), the **golden sunset glow** behind the lobby and podium, and **cut-paper illustrations**.

### 5.2 Color system (replaces the plum and bubblegum palette entirely)

**Dark theme ("Rooftop night", default)**

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A2E36` | page background (deep teal) |
| `--surface` | `#11414B` | cards and panels |
| `--surface-raised` | `#18535F` | modals, selected cards |
| `--line` | `#2F7684` | borders and dividers |
| `--ink` | `#06222A` | text on bright colors; hard shadows |
| `--text` | `#F2FBF8` | primary text |
| `--text-muted` | `#9CC9C6` | secondary text |
| `--primary` | `#FFB627` | marigold; main buttons and highlights (text on it: `--ink`) |
| `--primary-press` | `#E89E00` | pressed state |
| `--success` | `#4ADE80` | correct, connected |
| `--danger` | `#FF3B5C` | wrong, eliminated (always with a cross icon) |
| `--warn` | `#FFD166` | low-time warnings |
| `--shadow` | `#04181D` | hard-shadow color on dark |

**Light theme ("Rooftop day")**: `--bg #F1FAF7`, `--surface #FFFFFF`, `--surface-raised #E6F5F0`, `--line #BFE0D8`, `--ink #06222A`, `--text #0B2A31`, `--text-muted #4C7078`, `--primary #F2A100` (text on it `--ink`), `--primary-press #D98E00`, `--success #14A44D`, `--danger #D81E45`, `--warn #B37A00`, `--shadow #0B2A31`.

**Game accent colors** (each game's cover, header strip, round banner and result glow; text on them is `--ink`):

| Game | Accent | Hex |
|---|---|---|
| Pictionary | Tangerine | `#FF7A59` |
| Emoji Charades | Marigold-light | `#FFC94D` |
| Word Chain Blitz | Lime | `#B6E35B` |
| Reaction Duel | Hot pink | `#FF8FB8` |
| Typing Race | Sky | `#5CC8FF` |
| Quick Draw Quiz | Lilac | `#B9A4FF` |

**Reaction Duel signal colors.** Wait: amber `#FFB627`. Go: bright green `#2BD96B` (full bleed, text `--ink`). Decoys: blue `#4F7CFF`, pink `#FF8FB8`, purple `#8F6BFF`. Colors are never the only signal: the screen also shows the words "Wait" and "Tap now!".

**Rules**
- All text keeps at least 4.5:1 contrast (3:1 for large text and UI icons) in both themes. Verify with an automated check and fail the build if a token pair drops below.
- **Gradients in one place only:** a soft radial sunset glow (marigold to tangerine at 25% opacity fading to transparent) behind the lobby hero and the podium. Everything else is flat color.
- Never use cream or beige backgrounds, never black and neon pairings.

### 5.3 Typography
- Display and headings: **Bricolage Grotesque**, weights 700 and 800.
- Body and interface: **DM Sans**, weights 400, 500, 700.
- Typing passage: **Atkinson Hyperlegible**, 22 px or larger, line height 1.8.
- Timer and score numerals use tabular figures (`font-variant-numeric: tabular-nums`). If the chosen font does not support them, use Atkinson Hyperlegible for numerals.
- Sizes (px): 12, 14, 16, 18, 22, 28, 36, 48, 72. Body 16.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows.
- Self-host fonts with `font-display: swap` and metric-matched fallbacks to prevent layout shift.

### 5.4 Shape, space, motion
- **Hard-shadow tiles.** Cards: 2 px `--ink` border (in dark theme use `--line`), radius 16, solid offset shadow `4px 4px 0 var(--shadow)`. Buttons: radius 12, same border, shadow `3px 3px 0`; on press the button moves 3 px down-right and the shadow disappears. Inputs radius 12. Modals radius 20 with a 6 px shadow. No pill buttons and no glassy blur.
- Spacing: 4 px grid. Tap targets at least 48 px.
- Motion: 150 to 350 ms springs. Mandatory moments: the **round banner** sliding in (200 ms), countdown numerals popping, correct-answer pop with a short flame for streaks, elimination shake and grey-out, podium blocks rising with confetti, Reaction "Tap now!" snapping green instantly (no transition on that frame). Respect `prefers-reduced-motion` (fade instead, no confetti).
- Sound (synthesized): tick in the last 5 seconds, round start chime, correct, wrong, GO beep, elimination thud, fanfare. Mute and volume persist; sound off by default until the user taps unmute.

### 5.5 Screen-level direction
- **Landing and login:** left, headline and a rooftop skyline illustration with marigold sun; right, the form in a hard-shadow tile.
- **Lobby:** player avatars in a grid on tiles that wobble slightly on join; room code in a large copyable tile; game picker as six illustrated cards with their accent color; "Start" button in marigold.
- **In-game frame:** top strip shows the game name and accent, round dots (filled, current, upcoming), and the timer. Players listed with avatar, name, raw score and a live status dot. On phones the player strip collapses to avatars with scores below.
- **Round banner:** full-width accent-colored band with "Round 3 of 8" and the round twist (for example "Long words: 5 letters minimum").
- **Result screens:** point gains float up next to each avatar ("+243"); superlative badges appear as small round medals.
- **Podium:** three blocks of different heights in accent colors, avatars standing on top, the sunset glow behind, confetti.
- **Session standings:** a table with Arcade Points per game and a trophy beside the leader.

### 5.6 Icons and badges
Use a single consistent line icon set (Lucide) for interface icons. The superlative badges and medals are **hand-built SVGs** (circle plus symbol, accent colors), not generated images. A short list of medals: lightning, steady hand, comeback, speed demon, target, flame, brain, paintbrush, mind, wordsmith, survivor, thought bubble, trophy.

---

## 6. Image brief (v2)

The agent generates these with its image tool, saves them to `public/art/` with the exact names below, optimizes them, and writes alt text into `src/art/manifest.ts`. If the image tool is unavailable, tell the owner and fall back to procedural SVG avatars and CSS-drawn covers.

### 6.1 Global style string
Prepend to **every** prompt: *"Cut-paper collage illustration, layered flat paper shapes with soft contact shadows and a subtle paper grain, no outlines, warm golden-hour lighting, friendly and playful, limited palette of deep teal #0A2E36, teal #11414B, marigold #FFB627, tangerine #FF7A59, hot pink #FF8FB8, lime #B6E35B, sky #5CC8FF, lilac #B9A4FF, no text, no logos, no real people, no copyrighted characters."*

### 6.2 Assets

| File | Size | Subject |
|---|---|---|
| `avatar-01.webp` to `avatar-20.webp` | 512x512, transparent, under 60 KB | Head-and-shoulders cut-paper animals with a small office or break-room accessory, centered and symmetrical enough to crop into a circle. The app places each on a CSS circle in one of the accent colors, so keep the backgrounds transparent. Characters, in order: 1 owl with headphones, 2 tiger with a lanyard, 3 elephant with a tiny tie, 4 peacock with round glasses, 5 monkey holding a coffee, 6 panda with a laptop, 7 fox covered in sticky notes, 8 cat with a computer mouse, 9 octopus juggling pens, 10 sloth with a sleep mask, 11 parrot with a headset, 12 deer with sunglasses, 13 penguin with a tea glass, 14 camel with a backpack, 15 frog with a baseball cap, 16 bear in a hoodie, 17 rabbit with earbuds, 18 crocodile in a party hat, 19 dolphin with a bow tie, 20 hamster in a tiny robot suit |
| `cover-pictionary.webp` | 960x600, under 120 KB | A giant pencil drawing a wobbly rocket on a paper sheet, tangerine dominant |
| `cover-charades.webp` | 960x600 | A theatre mask and speech bubbles filled with abstract faces, marigold-light dominant |
| `cover-wordchain.webp` | 960x600 | Chunky paper letter blocks linked by a chain, lime dominant |
| `cover-reaction.webp` | 960x600 | A big glowing round button with a lightning bolt and a pointing hand, hot pink dominant |
| `cover-typing.webp` | 960x600 | Paper keyboard keys racing along a curving track with a finish flag, sky dominant |
| `cover-quiz.webp` | 960x600 | A buzzer button, a question mark bubble and a trophy, lilac dominant |
| `hero-skyline.webp` | 1920x700, under 200 KB | Rooftop at golden hour: a stylized city skyline of layered paper buildings with a large marigold sun and a small group of friends silhouettes with chai glasses, no faces |
| `art-empty-lobby.webp` | 800x600 | A lone paper chair and a speech bubble "waiting", invite feel |
| `art-waiting.webp` | 800x600 | A paper hourglass with sparkles |
| `art-celebrate.webp` | 800x600 | Confetti, streamers and a golden trophy |
| `art-offline.webp` | 800x600 | A paper plug unplugged from a socket, sad cloud |
| `art-404.webp` | 800x600 | A paper compass pointing in circles |
| `art-sound-off.webp` | 400x400 | A speaker with a slash (for the unmute prompt) |
| `logo-mark.svg` / `logo-wordmark.svg` | vector | Mark: a steaming chai glass whose steam curls into a game-controller outline, marigold on teal. Wordmark "Break Room Arcade" set in Bricolage Grotesque 800 |
| `favicon-*.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | standard | Derived from the logo mark |
| `og-share.webp` | 1200x630 | Logo mark, skyline strip, tagline "Quick games for your break" |

### 6.3 Image rules
- No text inside generated images (type is set in HTML).
- Avatars must remain readable at 40 px.
- Each image must have alt text; decorative images use empty alt.
- Total of all art on the first page load must stay within the performance budget (v1 NFR-1); lazy-load covers and illustrations.

---

## 7. Testing and Definition of Done (extends v1 Section 12)

### 7.1 Engine tests (must pass before any game is accepted)
1. `advance_phase` called 20 times concurrently advances exactly once.
2. A game completes with the host's browser closed after the game starts (host migration plus auto-advance).
3. A player refreshing at every phase of every game returns to the correct screen in under 2 seconds.
4. Content shortage is reported before a game starts.
5. Arcade Points conversion, including ties, spectators and players who left.
6. RLS: a non-member cannot read `room_players`, `round_submissions` or `game_state` of another room; `anon` cannot read any room data.

### 7.2 Per-game scripted scenarios (Playwright, 4 browser contexts; the 5th context spectates)
Each scenario asserts final **raw** and **Arcade** points against hand-computed numbers.

- **Reaction:** play all rounds with scripted tap delays (for example 300, 350, 400, 450 ms); one player false-starts in round 2; one never taps in round 4. Round 3 is Decoy: tap on a decoy color counts as a false start. Round 4 is Target: a tap outside the target is ignored.
- **Typing:** 3 rounds; one player types with 5 errors (accuracy under 90%); one gives up halfway; verify last-call shortens the clock to 20 s after the first finish.
- **Quiz:** 10 questions with scripted answers; verify the worked example (200 points, 400 on jackpot), streak reset on a wrong answer, and that `game_state` never contains the correct index before reveal (assert on the raw network responses).
- **Pictionary:** a full game where everyone draws once; verify the worked example (292 points); verify only the drawer receives the 3 words (assert on network); the drawer refreshes mid-round and keeps the drawing; the drawer is killed and the round is skipped after 10 s.
- **Charades:** verify letter and digit rejection, regional-indicator rejection, skip cost -25, and that the prompt never reaches non-actors (network assertion).
- **Word chain:** 3 rounds with the three twists; a player submits an already used word (rejected, timer continues); a player times out (eliminated, same required letter for the next player); verify longest-word bonus and placement points.

### 7.3 Timing tests
Clock skew of +5 s and -5 s on one client: all countdowns agree within 150 ms. 300 ms added latency and 3% packet loss: no game gets stuck (the watchdog E-5 recovers). A background tab for 30 s returns with correct timers.

### 7.4 Definition of done for a game
The scripted scenario passes; the engine tests pass; a manual 4-device play-through is documented in `docs/PLAYTEST_<game>.md` (date, devices, what went wrong, what was fixed); no secret appears in any network response to a non-entitled player; the UI works at 360 px width and on desktop; sound, motion and colors follow Section 5.

---

## 8. Order of work and reporting

1. **Gap analysis** and fix plan (owner approves).
2. **Engine:** heartbeat, `advance_phase`, `round_submissions`, `game_state`, watchdog, Arcade Points, RLS fixes (D7), content reservation. Engine tests pass.
3. **Visual system v2:** new tokens, fonts, tiles, round banner, in-game frame, podium (Section 5). Generate and place the images (Section 6).
4. **Games in this order:** Quiz, Typing Race, Reaction Duel, Pictionary, Emoji Charades, Word Chain Blitz. After each game: scripted scenario passes, playtest note written.
5. **Polish:** sound pass, accessibility audit, performance budget, soak test with the bot simulator.
6. **Final report** `docs/FINAL_REPORT.md` listing, for **each requirement ID in this document**, the test that proves it. Any requirement without a passing test is listed as not done.
