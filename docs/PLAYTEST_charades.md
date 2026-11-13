# Playtest Note: Emoji Charades (SRS v2 Section 3.5 & 7.3)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Emoji Charades  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.5  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Actor: Simran, Guessers: Kunal, Riya, Varun)
- **Test Scenarios:**
  - **Turn 1 (Simran as Actor):**
    - Secret Prompt drawn: `"Finding Nemo"` (Category: movies).
    - Simran opened picker:
      - Tapped `Animals` tab -> clicked `🐠` (clownfish).
      - Tapped `Objects` tab -> clicked `🚢` (boat) and `🌊` (wave).
      - Recents row populated with `[🐠, 🚢, 🌊]`.
    - Character Validation (EMO-2):
      - Simran typed `"Nemo"` from keyboard: stripped immediately. Clue contained strictly `🐠🚢🌊`.
    - Streaming Clue (EMO-3):
      - Clue broadcast to Kunal, Riya, and Varun within 250ms.
    - Automated Hints (EMO-6):
      - At $t = 30\text{s}$ (50% elapsed): Hint 1 revealed `💡 Category: MOVIES`.
      - At $t = 45\text{s}$ (75% elapsed): Hint 2 revealed `✨ 12 letters, starts with 'F'`.
    - Guessing Progression:
      - Kunal typed `"nemo"`: received `"nemo" is so close! Keep going!` (close feedback).
      - Riya typed `"Finding Nemo"` at $t = 30\text{s}$ (50% time remaining):
        - 1st correct guesser: $100\text{ base} + 75\text{ (time)} + 30\text{ (first)} = \mathbf{205\text{ pts}}$.
        - Riya entered "Guessed" side-channel.
      - Kunal typed `"Finding Nemo"` at $t = 48\text{s}$ (20% time remaining):
        - 2nd correct guesser: $100\text{ base} + 30\text{ (time)} + 0 = \mathbf{130\text{ pts}}$.
      - Varun typed `"Finding Nemo"` at $t = 54\text{s}$ (10% time remaining):
        - 3rd correct guesser: $100\text{ base} + 15\text{ (time)} = \mathbf{115\text{ pts}}$.
      - Since all 3 non-actors guessed, turn ended early.
      - Actor Scoring: $3 \times 50 + 50\text{ (all bonus)} = \mathbf{200\text{ pts}}$.
  - **Turn 2 (Prompt Skip Test - EMO-4):**
    - Kunal as actor got difficult prompt `"Monday morning blues"`.
    - Kunal clicked "Skip (-25 pts)":
      - Actor penalized $-25\text{ pts}$.
      - Prompt replaced with spare `"Happy hour"`.
      - Second skip worked; third skip button was disabled (capped at 2 skips).

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** Regional indicator flag sequences (e.g. 🇮🇳) can look like emojis but are composed of pairs of letters `\u{1F1E6}-\u{1F1FF}` which could be abused as alphabet clues.
   - **Fix:** Explicitly filtered out regional indicator range in `validateEmojiOnly`.
2. **Issue:** Emojis could accumulate indefinitely if actor tapped rapidly.
   - **Fix:** Hard-capped clue string to 20 emojis using `Array.from(str).slice(0, 20)`.
3. **Issue:** Guess input remained open after player guessed.
   - **Fix:** Switched guess input to "You guessed the prompt! 🎉" badge in Guessed side-channel.

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/charades.test.ts` (6 tests, all passing).
- **Categories:** 6 categorized tabs + Recents row.
- **Round Duration:** 60s.
- **Status:** **PASSED & DONE**.
