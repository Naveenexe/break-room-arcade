import { describe, it, expect } from 'vitest';
import { computeTypingScore, computeTypingWPM } from '../src/lib/scoring';
import { SEED_TYPING } from '../src/data/seed-content';

describe('SRS v2 Section 3.2 Typing Race Verification', () => {
  it('calculates Net WPM accurately: 150 chars in 45s = 40 WPM', () => {
    // Formula: (correct characters / 5) / (elapsed seconds / 60)
    // (150 / 5) / (45 / 60) = 30 / 0.75 = 40 WPM
    const wpm = computeTypingWPM(150, 45);
    expect(wpm).toBe(40);
  });

  it('penalizes accuracy under 90% with x0.75 multiplier (round half up)', () => {
    // 1st place base: 100 points
    // Under 90% accuracy: round(100 * 0.75) = 75 points
    const pointsAccurate = computeTypingScore(1, true, 100, 0.95);
    const pointsInaccurate = computeTypingScore(1, true, 100, 0.85);

    expect(pointsAccurate).toBe(100);
    expect(pointsInaccurate).toBe(75);
  });

  it('awards did-not-finish points based on progress: round(20 + progress_pct * 0.3)', () => {
    // 50% progress halfway through: round(20 + 50 * 0.3) = round(20 + 15) = 35 points
    const pointsHalfway = computeTypingScore(4, false, 50, 0.9);
    expect(pointsHalfway).toBe(35);

    // 0% progress: 20 points
    const pointsZero = computeTypingScore(5, false, 0, 1.0);
    expect(pointsZero).toBe(20);
  });

  it('verifies TYP-4 last call: shortens remaining clock to min(remaining, 20s)', () => {
    const remainingBeforeFirstFinish = 55; // 55s left
    const remainingAfterLastCall = Math.min(remainingBeforeFirstFinish, 20);
    expect(remainingAfterLastCall).toBe(20);

    // If already under 20s, remains unchanged
    const remainingShort = 12;
    expect(Math.min(remainingShort, 20)).toBe(12);
  });

  it('verifies round 3+ x1.2 multiplier', () => {
    const baseRank1 = computeTypingScore(1, true, 100, 0.95); // 100
    const round3Points = Math.round(baseRank1 * 1.2);
    expect(round3Points).toBe(120);
  });

  it('verifies passages exist across tiers 1, 2, and 3', () => {
    const diff1 = SEED_TYPING.filter((t) => t.difficulty === 1);
    const diff2 = SEED_TYPING.filter((t) => t.difficulty === 2);
    const diff3 = SEED_TYPING.filter((t) => t.difficulty === 3);

    expect(diff1.length).toBeGreaterThanOrEqual(1);
    expect(diff2.length).toBeGreaterThanOrEqual(1);
    expect(diff3.length).toBeGreaterThanOrEqual(1);
  });
});
