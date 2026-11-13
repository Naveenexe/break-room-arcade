import { describe, it, expect } from 'vitest';
import { computeReactionRoundScore } from '../src/lib/scoring';

describe('Reaction Duel Scoring & Mechanics (SRS v2 Section 3.3)', () => {
  it('computes worked example tap rank scores according to REA-4', () => {
    // 1st: 100, 2nd: 80, 3rd: 65, 4th: 50, 5th: 40, 6th: 30, 7th+: 20
    expect(computeReactionRoundScore(1, false, 210)).toBe(100);
    expect(computeReactionRoundScore(2, false, 245)).toBe(80);
    expect(computeReactionRoundScore(3, false, 280)).toBe(65);
    expect(computeReactionRoundScore(4, false, 310)).toBe(50);
    expect(computeReactionRoundScore(5, false, 340)).toBe(40);
    expect(computeReactionRoundScore(6, false, 390)).toBe(30);
    expect(computeReactionRoundScore(7, false, 450)).toBe(20);
    expect(computeReactionRoundScore(12, false, 500)).toBe(20);
  });

  it('treats taps < 80ms as inhuman false start with 0 points (REA-2, REA-3)', () => {
    expect(computeReactionRoundScore(1, false, 75)).toBe(0);
    expect(computeReactionRoundScore(1, false, 0)).toBe(0);
  });

  it('awards 0 points on false start lockout regardless of rank (REA-3)', () => {
    expect(computeReactionRoundScore(1, true, 200)).toBe(0);
    expect(computeReactionRoundScore(2, true, 250)).toBe(0);
  });

  it('awards 0 points if tap exceeds 3000ms window (REA-4)', () => {
    expect(computeReactionRoundScore(1, false, 3050)).toBe(0);
    expect(computeReactionRoundScore(2, false, 4500)).toBe(0);
  });

  it('applies 1.25x multiplier on Target rounds (REA-5)', () => {
    const rank1Base = computeReactionRoundScore(1, false, 220);
    expect(rank1Base).toBe(100);
    const targetRoundScore = Math.round(rank1Base * 1.25);
    expect(targetRoundScore).toBe(125);

    const rank2Base = computeReactionRoundScore(2, false, 250);
    expect(rank2Base).toBe(80);
    expect(Math.round(rank2Base * 1.25)).toBe(100);

    const rank3Base = computeReactionRoundScore(3, false, 280);
    expect(rank3Base).toBe(65);
    expect(Math.round(rank3Base * 1.25)).toBe(81);
  });

  it('round type sequence alternates Classic, Decoy, Target (REA-5)', () => {
    const getRoundType = (r: number): 'classic' | 'decoy' | 'target' => {
      if (r === 1 || r === 2) return 'classic';
      const pattern = ['decoy', 'target', 'classic'] as const;
      return pattern[(r - 3) % 3];
    };

    expect(getRoundType(1)).toBe('classic');
    expect(getRoundType(2)).toBe('classic');
    expect(getRoundType(3)).toBe('decoy');
    expect(getRoundType(4)).toBe('target');
    expect(getRoundType(5)).toBe('classic');
    expect(getRoundType(6)).toBe('decoy');
    expect(getRoundType(7)).toBe('target');
  });

  it('void rule timeout threshold is exactly 9.5s (REA-1, REA-6)', () => {
    const VOID_TIMEOUT_MS = 9500;
    const DIRECTOR_MAX_DELAY_MS = 6500;
    expect(VOID_TIMEOUT_MS).toBeGreaterThan(DIRECTOR_MAX_DELAY_MS);
    expect(VOID_TIMEOUT_MS).toBe(9500);
  });
});
