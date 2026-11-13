# Playtest Note: Typing Race (SRS v2 Section 3.2 & 7.4)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Typing Race ("Type Rush")  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.2  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Host: Asha, Player 2: Ravi, Player 3: Vikram, Player 4: Sneha) + 1 Spectator
- **Test Scenarios:**
  - 3 sequential rounds with passages scaling in difficulty: Round 1 (difficulty 1), Round 2 (difficulty 2), Round 3 (difficulty 3).
  - Scripted Typist Profiles:
    - Asha: Fast clean typist (68 WPM, 100% accuracy) -> Finished 1st in Round 1: **100 base points**.
    - Ravi: High speed with 5 errors (accuracy 86%, under 90% threshold) -> Finished 2nd: verified penalty $80 \times 0.75 = \mathbf{60\text{ points}}$.
    - Sneha: Gives up halfway (50% progress completed) -> Verified DNF formula $\text{round}(20 + 50 \times 0.3) = \mathbf{35\text{ points}}$.
    - Vikram: Types normally at 45 WPM.
  - TYP-4 Last Call Verification:
    - The instant Asha crossed the finish line at $t = 34\text{s}$, the remaining clock for Ravi, Vikram, and Sneha shortened to $\min(41\text{s}, 20\text{s}) = \mathbf{20\text{s}}$ with the last-call warning banner.
  - Round 3 Multiplier Verification:
    - Winner of Round 3 received the $1.2\times$ multiplier: $100 \times 1.2 = \mathbf{120\text{ points}}$.

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** Mobile and autocomplete keyboards could potentially paste words via composition events.
   - **Fix:** Attached `onPaste`, `onDrop`, and disabled autocomplete/autocorrect/spellcheck on input.
2. **Issue:** Prior build ran only 1 round and didn't apply round 3 multipliers.
   - **Fix:** Integrated multi-round passage sequencing with tiered difficulty and $1.2\times$ Round 3+ score bonus.
3. **Issue:** Race lanes did not display finished flags.
   - **Fix:** Added finish banner badge with completion time and WPM to the lane indicator.

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/typing.test.ts` (6 tests, all passing).
- **Net WPM Assertion:** Verified $(150 / 5) / (45 / 60) = 40\text{ WPM}$.
- **Accuracy Penalty Assertion:** Verified $<90\%$ accuracy yields $0.75\times$ penalty.
- **Status:** **PASSED & DONE**.

