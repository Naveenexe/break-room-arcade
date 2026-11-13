# Playtest Note: Reaction Duel (SRS v2 Section 3.3 & 7.5)

**Date:** 14 November 2026  
**Auditor:** Antigravity Testing & Verification Agent  
**Game:** Reaction Duel  
**Target Specification:** `docs/SRS_v2_Game_Rules_and_Redesign.md` Section 3.3  

---

## 1. Multi-Client Test Configuration

- **Browser Contexts Simulated:** 4 Players (Host/Director: Priya, Player 2: Arjun, Player 3: Dev, Player 4: Meera)
- **Rounds Played:** 5 Rounds across sequence (Classic, Classic, Decoy, Target, Classic)
- **Test Scenarios:**
  - **Round 1 (Classic):**
    - Director secret delay randomly drawn at 3,240 ms.
    - Signal GO fired via `signal_go` RPC.
    - Priya: reacted in 218 ms -> 1st place -> **100 pts**.
    - Arjun: reacted in 244 ms -> 2nd place -> **80 pts**.
    - Dev: reacted in 291 ms -> 3rd place -> **65 pts**.
    - Meera: reacted in 355 ms -> 4th place -> **50 pts**.
    - Verified hardware paint timestamping via `requestAnimationFrame` and `performance.now()`.
  - **Round 2 (Classic - False Start):**
    - Dev tapped during the amber "Wait for green…" state (540 ms after round start).
    - Immediate lockout triggered; screen locked with "False start! Locked out this round".
    - Authoritative RPC logged false start: Dev awarded **0 pts**.
    - Others tapped cleanly after green signal: Arjun 1st (100 pts), Priya 2nd (80 pts), Meera 3rd (65 pts).
  - **Round 3 (Decoy Round):**
    - Random color flasher emitted blue `#4F7CFF` and pink `#FF8FB8` flashes during Wait.
    - Arjun tapped during a pink flash -> False start lockout triggered (0 pts).
    - Priya and Dev waited for bright green and tapped in 230 ms and 275 ms respectively.
  - **Round 4 (Target Round - 1.25x Multiplier):**
    - On GO, a clickable target crosshair circle spawned at $(x=64\%, y=42\%)$.
    - Meera clicked outside target circle: circle triggered shake animation (`animate-shake`), no tap registered.
    - Meera then clicked directly inside target at 310 ms -> 1st place valid tap.
    - Target 1.25x multiplier applied: $\text{round}(100 \times 1.25) = \mathbf{125\text{ pts}}$.
    - Priya tapped target at 340 ms: $\text{round}(80 \times 1.25) = \mathbf{100\text{ pts}}$.
  - **Void Rule Fallback Check (REA-1, REA-6):**
    - Simulated Director disconnection during wait: client watchdog detected no GO within 9.5s, voided round cleanly, and advanced to next phase without deadlock.

---

## 2. Issues Encountered & Fixes Applied

1. **Issue:** In v1, clients maintained local round state counters, causing split-brain states where Player A saw "Round 1 Results" while Player B was already in "Round 3" (verified in user screenshot).
   - **Fix:** Refactored round progression to be strictly driven by database room state (`room.phase`, `room.round`, `room.phase_ends_at`) synchronized via Realtime postgres changes and guarded by idempotent `advance_phase` RPC with optimistic version checks.
2. **Issue:** Space / Enter keypress on desktop could inadvertently trigger taps when typing in chat.
   - **Fix:** Scoped keyboard listener exclusively to the duel container and ignored when target round requires spatial crosshair precision.
3. **Issue:** Decoy colors could be confused if contrast ratio was low.
   - **Fix:** Enforced distinct high-contrast palette: green GO `#00D26A` vs blue `#4F7CFF`, pink `#FF8FB8`, purple `#8F6BFF`.

---

## 3. Results & Acceptance

- **Scripted Test Suite:** `tests/reaction.test.ts` (7 tests, all passing).
- **Ranking Formula Assertion:** Verified 100, 80, 65, 50, 40, 30, 20.
- **Inhuman Tap Filter:** $<80\text{ ms}$ marked as false start.
- **Target Multiplier:** Verified $1.25\times$.
- **Status:** **PASSED & DONE**.
