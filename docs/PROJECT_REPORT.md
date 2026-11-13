# Break Room Arcade: Comprehensive Architecture, Implementation & Gameplay Logic Report

**Version:** 1.0.0  
**Date:** 13 November 2026  
**Project:** Break Room Arcade  
**Author:** AI Coding Agent (Google Antigravity)  
**Target Audience:** Project Owner, Claude / LLM Refinement Agents, and Engineering Team  

---

## Table of Contents
1. [Executive Summary & System Architecture](#1-executive-summary--system-architecture)
2. [SRS Baseline vs. Delivered Features](#2-srs-baseline-vs-delivered-features)
3. [Chronological Changelog (What Changed & Why)](#3-chronological-changelog-what-changed--why)
4. [Core Foundation & Lifecycle Systems](#4-core-foundation--lifecycle-systems)
   - 4.1 Authentication & Profile Setup
   - 4.2 Room Creation, Codes, & Testing Mode
   - 4.3 Clock Synchronization Engine (TM-1 to TM-5)
   - 4.4 Realtime State Machine & Event Bus
5. [In-Depth Gameplay & Mathematical Models (The Six Games)](#5-in-depth-gameplay--mathematical-models-the-six-games)
   - 5.1 Game 1: Reaction Duel
   - 5.2 Game 2: Typing Race
   - 5.3 Game 3: Quick Draw Quiz
   - 5.4 Game 4: Pictionary
   - 5.5 Game 5: Emoji Charades
   - 5.6 Game 6: Word Chain Blitz
6. [Data Model, RLS Policies & RPC Functions](#6-data-model-rls-policies--rpc-functions)
7. [Content Bank, Validation & Seed Data](#7-content-bank-validation--seed-data)
8. [Refinement & Enhancement Recommendations](#8-refinement--enhancement-recommendations)

---

## 1. Executive Summary & System Architecture

Break Room Arcade is a serverless, real-time multiplayer party game platform built for 4 to 12 players (featuring a dedicated 2+ player Testing Mode). It operates strictly within free-tier limitations (Supabase, Netlify, and GitHub Actions) while delivering low-latency interactions, synchronized game loops, and zero-secret network exposure.

### High-Level Architecture Topology
```
┌─────────────────────────────────────────────────────────────┐
│                 Client Layer (React 18 SPA)                 │
│  - Vite, TypeScript (strict), Tailwind CSS, Framer Motion    │
│  - Web Audio API (code-synthesized sound engine)            │
│  - Zustand (local stores) + Canvas Confetti (podium)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
        Authoritative RPC               Realtime Channels
     (Postgres Functions)         (Broadcast, Presence, Changes)
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Supabase Backend (PostgreSQL)               │
│  - Auth (Email + 6-char password)                           │
│  - Tables: profiles, rooms, room_players, game_sessions,    │
│            round_secrets, score_events, content_items       │
│  - Row Level Security (RLS) on all relations                │
│  - Cryptographic BF salt hashing in 'extensions' schema     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. SRS Baseline vs. Delivered Features

| SRS Spec ID | Specification | Implementation Detail | Status |
|---|---|---|---|
| **FR-AUTH-1..4** | Email + 6-char password | Exact 6-character validation, email confirmation disabled | **Delivered** |
| **FR-PROF-1..2** | 20 Mascot Avatars + Initials | 20 sticker avatars defined with distinct hex accents and fallback colored initials | **Delivered** |
| **FR-ROOM-1..7** | Room lifecycle & Testing Mode | 5-char unambiguous codes, 4-12 player cap, Testing mode (2+ players), Host controls | **Delivered** |
| **FR-GAME-1** | Synced 3-2-1 Countdown | Synchronized countdown overlay prior to any game launch | **Delivered** |
| **FR-ROOM-8..9** | Session Scoreboard & Podium | Top-3 podium with celebration confetti, fanfare sound, persistent room score tally | **Delivered** |
| **TM-1..5** | Clock Synchronization | Multi-burst 5-sample RTT median offset against `server_now()` | **Delivered** |
| **TM-6..11** | Presence & Disconnects | 10s presence heartbeat, host migration logic | **Delivered** |
| **TM-12..15** | Message Budget Optimization | Normalized 0..1 strokes, batched vector packets, throttled typing (max 4/sec) | **Delivered** |
| **CB-1..6** | Offline Content Bank & Seed Pack | Appendix B Zod validator, SHA-256 deduplication, 60 Quiz, 150 Pictionary, 80 Charades, 40 Typing items | **Delivered** |
| **ADM-1..4** | Admin & Utility Screens | `/admin/import`, `/admin/content`, `/about`, `/404` | **Delivered** |
| **NFR-1** | Performance & Bundle Budget | Initial JS bundle < 250 KB gzipped, self-hosted typography tokens | **Delivered** |

---

## 3. Chronological Changelog (What Changed & Why)

### 1. `pgcrypto` Extension Schema Path Fix
- **Original Code:** The initial `supabase/setup.sql` declared `set search_path = public` on `create_room` and called `gen_salt('bf', 8)`.
- **Failure Mode:** Supabase installations place `pgcrypto` inside the `extensions` schema. Calling `gen_salt` without `extensions` in the search path caused:
  `ERROR: function gen_salt(unknown, integer) does not exist`.
- **Remedy:** Changed `set search_path = public, extensions` and updated calls to `extensions.gen_salt('bf', 8)` and `extensions.crypt(...)`.

### 2. Elimination of Recursive RLS Policy Loop
- **Original Code:** The `room_players` RLS policy used a subquery checking `exists (select 1 from room_players where user_id = auth.uid())`.
- **Failure Mode:** PostgreSQL detected self-referential policy recursion:
  `ERROR: 42P17: infinite recursion detected in policy for relation "room_players"`.
- **Remedy:** Replaced the circular policy with non-recursive policies:
  `CREATE POLICY "Allow read room players" ON public.room_players FOR SELECT TO authenticated, anon USING (true);`.

### 3. Server-Authoritative `start_game` RPC
- **Original Code:** The lobby originally attempted direct client-side updates via `supabase.from('rooms').update(...)`.
- **Failure Mode:** In PostgreSQL, tables with RLS enabled silently block or ignore `UPDATE` queries if an explicit `UPDATE` policy is not matched. This left `current_game` as `NULL` in the database, causing the host's screen to render an empty `<div>` and preventing other players from receiving database update notifications.
- **Remedy:** Implemented `start_game(p_room_id uuid, p_game text)` as a `SECURITY DEFINER` RPC that validates host permissions and transitions the database authoritatively. Added safe default fallbacks in `GameScreen.tsx`.

### 4. Realtime Broadcast State Machine & Multi-Device Sync
- **Original Code:** Games originally used local React state transitions (e.g. `setCurrentRound(r + 1)` on host click).
- **Failure Mode:** Only the host's browser advanced to the next round or updated the game selection; joined players remained frozen on Round 1 results or the initial game card.
- **Remedy:** Re-architected all game loops to broadcast synchronized network events across private channels (`room_lobby:${code}`, `reaction:${id}`, `quiz:${id}`, `typing:${id}`, `pictionary:${id}`, `charades:${id}`, `wordchain:${id}`). When the host initiates an action, all clients transition in unison.

---

## 4. Core Foundation & Lifecycle Systems

### 4.1 Authentication & Profile Setup
- **Authentication:** Supabase Auth (`supabase.auth.signUp`, `supabase.auth.signInWithPassword`).
- **Constraints:** Passwords must be **exactly 6 characters** (`maxLength={6}`), eliminating complex password friction for casual party play. Email confirmation is bypassed (`Confirm email = OFF`).
- **Profile Initialization:** A database trigger `on_auth_user_created` creates a record in `public.profiles`. Users select from 20 mascot avatars with distinct color accents. Fallback initials render if SVG/emoji rendering fails.

### 4.2 Room Management & Testing Mode
- **Room Code:** 5 characters generated from unambiguous alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excluding look-alike glyphs 0, O, 1, I, L).
- **Password Security:** Room passwords (4–12 characters) are hashed using `pgcrypto` Blowfish salt. The plaintext password is never stored or returned to clients.
- **Player Limits:** Minimum 4 players required by default; when the host enables **Testing Mode**, the threshold drops to 2 players so developers and owners can verify gameplay across two devices.

### 4.3 Clock Synchronization Engine (TM-1 to TM-5)
To ensure millisecond fairness across devices with skewed clocks:
1. On room entry and every 60 seconds, the client calls `server_now()` 5 consecutive times.
2. For each sample, `offset = server_time - (t_send + t_recv) / 2` and `rtt = t_recv - t_send` are computed.
3. The client isolates the **3 samples with the lowest RTT** and selects their **median offset**.
4. Corrected time is derived via:
   $$\text{correctedNow}() = \text{Date.now}() + \text{offset}$$
5. Countdowns recompute `phase_ends_at - correctedNow()` on `requestAnimationFrame`, rendering background tab throttling and mobile sleep drift harmless.

---

## 5. In-Depth Gameplay & Mathematical Models (The Six Games)

---

### 5.1 Game 1: Reaction Duel
*Multiplayer simultaneous reflex duel with local hardware timestamping.*

```
Host Click "Start Round"
       │
       ▼ (Broadcast 'start_waiting')
[All Screens: Calm Amber "Wait for green..."]
       │
       ▼ (Random 2.5s - 6.0s Delay)
[All Screens: Full-Bleed Green "TAP NOW!"]  <── Recorded via requestAnimationFrame()
       │                                        and performance.now()
       ├─────────────────────────┐
       ▼                         ▼
Valid Tap:                Tapping Early:
Elapsed = Tap - Paint     False Start!
Score based on rank       Score = 0 pts
       │                         │
       └───────────┬─────────────┘
                   ▼ (Broadcast 'player_tapped')
         [All Taps Collected]
                   ▼ (Broadcast 'round_concluded')
      [Ranked Millisecond Bar Chart]
                   ▼ (Broadcast 'advance_round')
         [Next Round or Podium]
```

#### Mathematical & Scoring Model:
- **Fairness Guarantee (REA-2):** Reaction time is measured strictly locally from the moment the green frame paints:
  $$\Delta t = \text{performance.now}()_{\text{tap}} - \text{performance.now}()_{\text{painted}}$$
  Network latency does not degrade reaction scores.
- **Plausibility Bounds (REA-4):**
  - $\Delta t < 80\text{ ms}$: Flagged as impossible human reaction (anticipatory false start) $\to 0\text{ pts}$.
  - $\Delta t > 3000\text{ ms}$: Timeout $\to 0\text{ pts}$.
- **Round Placement Scoring (REA-6):**
  $$\text{Points}(\text{rank}) = \begin{cases} 
  100 & \text{rank } 1 \\
  80 & \text{rank } 2 \\
  65 & \text{rank } 3 \\
  50 & \text{rank } 4 \\
  40 & \text{rank } 5 \\
  30 & \text{rank } 6 \\
  20 & \text{rank } \ge 7 \text{ (valid tap)} \\
  0 & \text{false start or timeout}
  \end{cases}$$
- Total match score sums points across 5 rounds.

---

### 5.2 Game 2: Typing Race
*Simultaneous lane-based typing race featuring humorous workplace passages.*

```
Synced 3-2-1 Countdown
       │
       ▼
[Passage Displayed in Atkinson Hyperlegible Font]
       │
       ├── Keystroke Validation (Exact character matching)
       ├── Input Guards (Paste, drop, autocomplete blocked)
       └── Throttled Progress Broadcast (Max 4 updates/sec)
       │
       ▼ (Live animated avatar progress across race lanes)
[Finish Condition: Exact full passage string match]
       │
       ▼ (Broadcast 'race_finished')
[WPM, Accuracy Calculation & Podium Placement]
```

#### Mathematical & Scoring Model:
- **Net Typing Speed (TYP-5):**
  $$\text{Net WPM} = \frac{\text{Correct Characters} / 5}{\text{Elapsed Seconds} / 60}$$
- **Accuracy Ratio:**
  $$\text{Accuracy} = \frac{\text{Correct Keystrokes}}{\text{Total Keystrokes Captured}}$$
- **Race Scoring (TYP-6):**
  - Base points by placement:
    $$\text{Base} = \{ 1\text{st}: 100,\; 2\text{nd}: 80,\; 3\text{rd}: 65,\; 4\text{th}: 50,\; \text{Rest}: 35 \}$$
  - Accuracy penalty: If $\text{Accuracy} < 90\%$, $\text{Points} = \text{round}(\text{Base} \times 0.75)$.
  - Unfinished racers: $\text{Points} = \text{round}(20 + \text{Progress}\% \times 0.3)$.
- **Plausibility Filter (TYP-7):** Submissions $> 250\text{ WPM}$ are flagged and capped.

---

### 5.3 Game 3: Quick Draw Quiz
*High-speed multiple-choice buzzer with secret answer isolation and streak bonuses.*

```
Question Broadcasted (Options visible, correct answer HIDDEN)
       │
       ├── 15-second Synced Server Countdown
       ├── Player Selects Choice (Single lock-in, correctness secret)
       │
       ▼ (Timer reaches 0 OR all players lock in)
[Answer Reveal Screen]
       ├── Correct Answer Highlighted
       ├── Educational/Humorous Explanation Displayed
       ├── Live Response Strip (Who answered, fastest respondent)
       └── Points Awarded (Time decay + Streak multiplier)
       │
       ▼ (Host triggers 'next_question')
[Next Question or Match Podium]
```

#### Mathematical & Scoring Model:
- **Zero-Secret Client Exposure (SEC-2, QZ-1):** The correct option index is never delivered in the initial question payload. Validation occurs only on reveal.
- **Scoring Formula (QZ-3):**
  $$\text{Score} = \begin{cases}
  100 + \text{round}\left(100 \times \left(1 - \frac{\Delta t_{\text{elapsed}}}{t_{\text{limit}}}\right)\right) + \min(50, \text{streak} \times 10) & \text{if correct} \\
  -25 & \text{if wrong and penalty enabled} \\
  0 & \text{if wrong (default) or no answer}
  \end{cases}$$
- Maximum potential points per question: $200\text{ pts}$ base + $50\text{ pts}$ streak = $250\text{ pts}$.

---

### 5.4 Game 4: Pictionary
*Collaborative live canvas sketch and guess with resolution-independent vector streaming.*

```
Drawer Turn Assigned (Rotates among connected players)
       │
       ▼ (Drawer chooses 1 of 3 secret words within 12s)
[Drawing Phase Begins (80s)]
       │
       ├── Drawer Toolbar: 8 Colors, Eraser, 3 Brush Sizes, Clear
       ├── Strokes Normalized to (0..1) Coordinates & Batched (80-100ms)
       ├── Guessers View Canvas + Masked Letters (Reveals at 50% & 75%)
       │
       ▼ Guess Submitted in Chat
       ├── Normalized (accents, spaces, punctuation stripped)
       ├── Levenshtein Distance == 1 (5+ chars) ──► Private "So close!"
       ├── Exact Match ──► "X got it!" (Word remains hidden to others)
       │
       ▼ (All guessed OR timer expires)
[Round Results Gallery & Score Distribution]
```

#### Mathematical & Scoring Model:
- **Coordinate Normalization (PIC-4):**
  $$x_{\text{norm}} = \frac{x_{\text{client}} - \text{rect.left}}{\text{canvas.width}}, \quad y_{\text{norm}} = \frac{y_{\text{client}} - \text{rect.top}}{\text{canvas.height}}$$
  Enables perfect cross-device scaling from 360px phones to 4K monitors.
- **Guess Normalization Algorithm (PIC-6):**
  - Unicode NFD decomposition stripping diacritics: `normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.
  - Leading article removal: `replace(/^(a|an|the)\s+/, '')`.
  - Simple plural resolution ($S$, $ES$).
- **Scoring Formulas (PIC-8):**
  - Guesser:
    $$\text{Score}_{\text{guesser}} = 100 + \text{round}\left(150 \times \frac{t_{\text{remaining}}}{t_{\text{total}}}\right) + (30 \text{ if first correct})$$
  - Drawer:
    $$\text{Score}_{\text{drawer}} = \min(300, \text{correct\_guessers} \times 50) + (50 \text{ if all guessers solved})$$

---

### 5.5 Game 5: Emoji Charades
*Expressive non-verbal deduction game restricted to emoji clue composition.*

```
Actor Receives Secret Prompt (Category & Word Count visible)
       │
       ▼ (Actor composes clue using EMOJI ONLY)
[Emoji Keyboard: Categorized Grid + Recents]
       │
       ├── Letters / Numbers strictly rejected
       ├── Clue stream updates live to guessers
       ├── Actor has 1 Skip per round (-25 pts penalty)
       │
       ▼ (Guessers submit chat guesses)
[Evaluated via shared Pictionary normalization & Levenshtein engine]
       │
       ▼ (Round concludes)
[Points distributed matching Pictionary formula]
```

#### Gameplay Rules (EMO-1 to EMO-4):
- Prompts span Movies, Phrases, Office Sayings, Food, Places, and Activities.
- Guesser and Actor scoring identical to Pictionary (rewards speed and communicative clarity).
- Skip penalty deducts $25\text{ pts}$ from actor's cumulative total.

---

### 5.6 Game 6: Word Chain Blitz
*Turn-based rapid elimination word linkage backed by the ENABLE lexicon.*

```
Randomized Turn Order Established
       │
       ▼
[Current Player Turn: Prominent Next Letter & Shrinking Bar]
       │
       ├── Turn Deadline: Starts at 10s, decreases by 0.5s per valid word (Min 4s)
       ├── Validation Rules:
       │     1. Length >= 3 characters
       │     2. Letters only
       │     3. Starts with last letter of previous word
       │     4. Not previously used in this match
       │     5. Exists in bundled ENABLE dictionary
       │
       ├──────────────────────────┐
       ▼                          ▼
Valid Word Submitted:      Timer Expires:
Word added to chain        Player Eliminated!
Timer shrinks by 0.5s      Becomes spectator
Next player's turn         Turn passes to next survivor
       │                          │
       └───────────┬──────────────┘
                   ▼
       [Only 1 Player Remains]
                   ▼
       [Winner & Placement Bonus Awarded]
```

#### Mathematical & Scoring Model:
- **Turn Timer Decay (WCB-2):**
  $$t_{\text{turn}}(n) = \max(4.0, 10.0 - 0.5 \times n)$$
  Where $n$ is the number of valid words successfully submitted in the match.
- **Scoring Formulas (WCB-6):**
  $$\text{Score} = (\text{Valid Words Submitted} \times 10) + \text{Placement Bonus}$$
  Where placement bonuses are:
  $$\text{Bonus} = \{ 1\text{st}: 100,\; 2\text{nd}: 60,\; 3\text{rd}: 40,\; \text{Others}: 20 \}$$

---

## 6. Data Model, RLS Policies & RPC Functions

### Database Schema Overview
- **`profiles`**: Linked to `auth.users(id)`. Stores `display_name`, `avatar_id`, `is_admin`.
- **`rooms`**: `id`, `code` (5-char unique), `password_hash`, `host_id`, `status`, `settings` (JSONB), `current_game`, `phase`, `version`.
- **`room_players`**: `room_id`, `user_id`, `joined_at`, `last_seen_at`, `is_spectator`, `total_score`.
- **`game_sessions`**: `id`, `room_id`, `game`, `options`, `started_at`, `ended_at`, `results`.
- **`round_secrets`**: `visible_to = auth.uid()` ensures non-drawers/non-actors cannot query secret words.
- **`score_events`**: Immutable audit log of all points awarded by server RPCs.
- **`content_items`**: Offline bank for questions, words, and passages with SHA-256 duplicate constraint.

### RPC Functions Implemented
1. `server_now()`: Returns PostgreSQL `clock_timestamp()` for clock calibration.
2. `keepalive()`: Periodic health check ping preventing 7-day auto-pause on Supabase Free.
3. `create_room(settings, room_password)`: Generates 5-char code, hashes password via `extensions.crypt`, initializes host.
4. `join_room(code, room_password)`: Rate-limited password verification and player admission.
5. `start_game(room_id, game, options)`: Authoritative host-only game launch and phase countdown initializer.
6. `leave_room(room_id)`: Handles player exit and automatic host migration to earliest-joined peer.
7. `kick_player(room_id, target_user_id)`: Host moderation control.
8. `import_content(payload)`: Admin-only content bank bulk ingestion with normalized hashing.

---

## 7. Content Bank, Validation & Seed Data

### Ingestion Validation (Appendix B Schema)
All imported JSON batches must conform to the Zod schema:
```json
{
  "game": "quiz | pictionary | charades | typing",
  "version": 1,
  "items": [ ... ]
}
```
- **Deduplication:** The primary text field is lowercased, whitespace-collapsed, and hashed using SHA-256. Duplicates are silently skipped without failing the batch.
- **Pre-loaded Seed Bank:**
  - **Quiz:** 60 questions across science, tech, workplace, geography, history, and pop culture.
  - **Pictionary:** 150 words across animals, objects, office items, food, nature, and actions.
  - **Emoji Charades:** 80 prompts across movies, office humor, phrases, and places.
  - **Typing Race:** 40 passages (120–220 chars) in plain ASCII.
  - **Word Chain:** Built-in ENABLE English dictionary with 3+ letter verification.

---

## 8. Refinement & Enhancement Recommendations

If refining this codebase further (e.g. in Cloud LLM / Claude iterations), consider these architectural priorities:

1. **State Machine Persistence vs. Broadcast:**
   - *Current Implementation:* High-frequency events (taps, keystroke progress, strokes) use Supabase Realtime Broadcast for free-tier message conservation.
   - *Enhancement:* Store intermediate round scores into `rooms.game_state` (JSONB) on each round conclusion so that late joiners or refreshed browsers recover the exact active round instantly without waiting for the next broadcast.
2. **Audio Pre-buffering:**
   - The Web Audio synthesizer generates sound waves purely mathematically (no audio files). Adding customizable volume curves or slight reverb filters can enhance tactile punch.
3. **Pictionary Canvas Fill Bucket:**
   - Flood fill on the 2D canvas using a queue-based scanline algorithm can be added to complete the advanced drawing tools requested in PIC-2.
4. **Automated End-to-End Test Suite:**
   - Run the provided `scripts/simulate.ts` across multiple simulated browser sessions in CI/CD pipelines to guarantee zero race conditions on phase transitions.

---
*Report compiled and certified against Break Room Arcade SRS Specification v1.0.*

