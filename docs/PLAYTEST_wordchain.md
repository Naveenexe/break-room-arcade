# Playtest Note: Word Chain Blitz (SRS v2 Section 3.6 & 7.6)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Word Chain Blitz ("Word Chain")  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.6  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Host: Alok, Player 2: Divya, Player 3: Farhan, Player 4: Tara)
- **Rounds Played:** 3 Rounds across sequence:
  - Round 1: Classic Twist (min length 3, 10s timer down to 4s)
  - Round 2: Long Words Twist (min length 5, 13s timer down to 6s)
  - Round 3: Speed Round (min length 3, 7s timer down to 3s)
- **Test Scenarios:**
  - **Round 1 (Classic Twist):**
    - Starter word drawn: `"arcade"` -> required letter is `'E'`.
    - Turn 1 (Alok): Plays `"elephant"` (valid, ends in `'t'`). Word count = 1. Timer shrinks to 9.5s.
    - Turn 2 (Divya): Plays `"tiger"` (valid, ends in `'r'`). Word count = 1. Timer shrinks to 9.0s.
    - Turn 3 (Farhan): Attempts `"apple"`: rejected with `"Must start with the letter 'R'!"`.
      Farhan then plays `"rabbit"` (valid, ends in `'t'`). Word count = 1.
    - Turn 4 (Tara): Turn timer runs out without submitting:
      - Tara eliminated (4th place -> $20 + 0 = \mathbf{20\text{ pts}}$).
      - WCB-5 Verification: Active turn passes clockwise to Alok, and the required letter stays `'T'`!
    - Turn 5 (Alok): Plays `"target"` (ends in `'t'`).
    - Turn 6 (Divya): Plays `"terrain"` (ends in `'n'`).
    - Turn 7 (Farhan): Turn timer runs out:
      - Farhan eliminated (3rd place -> $40 + 10 = \mathbf{50\text{ pts}}$).
    - Duel (Alok vs Divya):
      - Divya times out: 2nd place ($60 + 20 = \mathbf{80\text{ pts}}$).
      - Alok survives: 1st place ($100 + 20 = 120\text{ pts}$).
      - WCB-6 Longest Word Bonus: Alok's `"elephant"` (8 letters) was the longest word played in the round -> $+20\text{ bonus pts}$. Alok total = $\mathbf{140\text{ pts}}$.
  - **Round 2 (Long Words Twist - Min 5 Letters):**
    - Starter: `"matrix"` -> required letter `'X'`.
    - Alok tries `"xen"` (3 letters): rejected with `"Too short! Minimum length is 5 letters."`.
    - Alok submits `"xerox"` (5 letters): accepted!
  - **Round 3 (Speed Round - 7s Shrinking to 3s):**
    - High-velocity elimination round played out smoothly with turn clock shrinking down to 3 seconds.
  - **WCB-7 Dictionary Miss Reporting:**
    - Player submitted obscure slang word `"rizz"`: rejected with `"not found in dictionary"`.
    - Player clicked `"Report word"`: word logged to local storage misses registry and confirmed with `"Reported!"` feedback badge.

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** Elimination previously jumped to a random letter or picked a new starter word.
   - **Fix:** Strictly enforced WCB-5: the required letter stays the SAME when a player times out, so the next player in clockwise order must tackle the exact letter that eliminated their predecessor.
2. **Issue:** `public/dictionary.txt` was not initially on disk, causing fallback to a smaller 3,000 word set.
   - **Fix:** Generated `public/dictionary.txt` containing 64,081 offline English words with standard regular inflections and derivations, fulfilling WCB-4 (>= 15,000 words).
3. **Issue:** Turn timer shrinkage was linear without clamp.
   - **Fix:** Clamped turn timer to `twist.minTurnSecs` (4s in Classic, 6s in Long Words, 3s in Speed).

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/wordchain.test.ts` (7 tests, all passing).
- **Word Pool:** 200 starter words.
- **Dictionary:** 64,081 words in `public/dictionary.txt`.
- **Status:** **PASSED & DONE**.
