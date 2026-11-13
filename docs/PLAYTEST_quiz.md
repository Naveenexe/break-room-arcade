# Playtest Note: Quick Draw Quiz (SRS v2 Section 3.3 & 7.4)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Quick Draw Quiz  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.3  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Host: Asha, Player 2: Ravi, Player 3: Vikram, Player 4: Sneha) + 1 Spectator
- **Test Scenarios:**
  - 10 full multiple-choice rounds with 15s timer.
  - Scripted response times:
    - Asha: Answers correctly at 3.0s in Round 1 (streak 2) -> Verified **200 raw points**.
    - Ravi: Answers correctly at 2.0s -> 220 raw points.
    - Vikram: Wrong answer in Round 3 -> Streak resets immediately to 0.
    - Sneha: No answer in Round 4 -> 0 points, streak resets.
  - Jackpot Question (Round 5):
    - Asha answers correctly at 3.0s -> Verified **400 raw points** (exact 2x jackpot doubling).
- **Network Leak Audit:**
  - Inspected network responses during the `answer` phase.
  - Confirmed `answerIndex` is never returned in client state before the `reveal` phase.

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** Prior implementation checked answers in browser memory against `SEED_QUIZ` bundle.
   - **Fix:** Switched to server `submit_answer` RPC with server latency clamping (E-6) and answer isolation.
2. **Issue:** Streak was not resetting when a player failed to answer before the deadline.
   - **Fix:** Added streak reset logic on timeout during phase transition.
3. **Issue:** Missing Jackpot visual cues on Round 5 and Round 10.
   - **Fix:** Added glowing Jackpot banner and 2x point animations on reveal.

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/quiz.test.ts` (7 tests, all passing).
- **Worked Example Assertion:** Exactly 200 points on standard round, 400 points on Jackpot round verified.
- **Arcade Points Conversion:** Top-ranked player successfully awarded 10 Arcade Points; tied scores share points.
- **Status:** **PASSED & DONE**.
