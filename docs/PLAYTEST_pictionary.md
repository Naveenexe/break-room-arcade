# Playtest Note: Pictionary (SRS v2 Section 3.4 & 7.2)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Pictionary (Draw & Guess)  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.4  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Drawer: Rohit, Guessers: Ananya, Karan, Pooja)
- **Test Scenarios:**
  - **Turn 1 (Rohit Drawing):**
    - Drawer presented with 3 tiered word choices: Easy ("elephant"), Medium ("chameleon"), Hard ("woodpecker").
    - 10-second countdown displayed; Rohit selected "elephant".
    - Non-drawers received masked clue: `_ _ _ _ _ _ _ _` (8 letters).
    - Rohit drew on 3:2 canvas using v2 palette (`#1B1917` charcoal, `#00D26A` mint) and brush size Medium (7px).
    - Stroke batching: strokes streamed smoothly over broadcast channel to all 3 guessers with sub-100ms latency.
    - Automated Hints (PIC-7):
      - At $t = 30\text{s}$ (40% elapsed): Hint 1 revealed first letter: `E _ _ _ _ _ _ _`.
      - At $t = 53\text{s}$ (70% elapsed): Hint 2 revealed 1 random letter: `E _ _ P _ _ _ _`.
    - Guessing Progression:
      - Karan typed "elephat": Received private feedback `"elephat" is so close! Keep trying!` (Levenshtein distance 1).
      - Ananya guessed "elephant" at $t = 22.5\text{s}$ (70% time remaining):
        - 1st correct guesser bonus: $100\text{ base} + 105\text{ (time)} + 30\text{ (first)} = \mathbf{235\text{ pts}}$.
        - Ananya entered "Guessed" side-channel: input disabled with "You guessed the word! 🎉", chat hidden from active guessers.
      - Karan guessed "elephant" at $t = 45\text{s}$ (40% time remaining):
        - 2nd correct guesser: $100\text{ base} + 60\text{ (time)} + 0 = \mathbf{160\text{ pts}}$.
      - Pooja guessed "elephant" at $t = 60\text{s}$ (20% time remaining):
        - 3rd correct guesser: $100\text{ base} + 30\text{ (time)} = \mathbf{130\text{ pts}}$.
      - Since all 3 non-drawers guessed, round ended early!
      - Drawer Scoring: $3 \times 50 + 50\text{ (all guessed bonus)} = \mathbf{200\text{ pts}}$.
  - **Turn 2 (Watchdog & Eraser / Undo Test):**
    - Ananya as drawer did not pick within 10s: watchdog auto-picked Medium word.
    - Ananya drew lines, clicked Undo (removed last continuous stroke), clicked Eraser, and clicked Clear (canvas wiped cleanly on all screens).

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** Levenshtein distance test had a false expectation where `"elefant"` had distance 2 from `"elephant"` (substitution + deletion).
   - **Fix:** Used single-substitution typos (`"elephat"`, `"elephand"`) which precisely test distance 1 and trigger "So close!" feedback.
2. **Issue:** Word spacing in multi-word clues (e.g. "ice cream") was previously indistinguishable from intra-letter spaces.
   - **Fix:** Enforced quadruple spacing between words (`_ _ _    _ _ _ _ _`) so word boundary structure is visually clear to guessers.
3. **Issue:** Guessers typing very quickly could flood chat and bypass server limits.
   - **Fix:** Enforced 800ms client-side throttling with visual rate-limit warning.

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/pictionary.test.ts` (7 tests, all passing).
- **Aspect Ratio:** Fixed 3:2 aspect ratio canvas with normalized $[0, 1]$ floating-point coordinates.
- **Palette & Brushes:** 8 v2 colors, 3 sizes (3, 7, 14), Undo, Eraser, Clear.
- **Status:** **PASSED & DONE**.
