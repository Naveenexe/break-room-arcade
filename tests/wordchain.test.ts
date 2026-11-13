import { describe, it, expect } from 'vitest';
import {
  validateWordChainSubmission,
  getRoundTwist,
  STARTER_WORDS,
} from '../src/games/WordChainBlitz';
import { computeWordChainScore } from '../src/lib/scoring';

describe('Word Chain Blitz Mechanics & Scoring (SRS v2 Section 3.6 & 7.6)', () => {
  const mockDict = (w: string) => ['apple', 'elephant', 'tiger', 'rabbit', 'target', 'terrain'].includes(w);

  it('validates starting letter matching previous word last letter (WCB-4)', () => {
    const used = new Set<string>();
    // Previous word ended with 'T' (e.g. 'rabbit') -> required letter is 't'
    const resGood = validateWordChainSubmission('tiger', 't', 3, used, mockDict);
    expect(resGood.valid).toBe(true);

    const resBad = validateWordChainSubmission('apple', 't', 3, used, mockDict);
    expect(resBad.valid).toBe(false);
    expect(resBad.error).toBe('invalid_letter');
    expect(resBad.message).toContain('Must start with the letter "T"');
  });

  it('rejects words already used in the current round (WCB-4)', () => {
    const used = new Set(['tiger']);
    const res = validateWordChainSubmission('tiger', 't', 3, used, mockDict);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('already_used');
  });

  it('enforces twist minimum word lengths (WCB-2 & WCB-4)', () => {
    const used = new Set<string>();
    // Classic min length 3
    const resClassic = validateWordChainSubmission('to', 't', 3, used, mockDict);
    expect(resClassic.valid).toBe(false);
    expect(resClassic.error).toBe('too_short');

    // Long Words twist min length 5
    const resLong = validateWordChainSubmission('tiger', 't', 5, used, mockDict);
    expect(resLong.valid).toBe(true);

    const resLongShort = validateWordChainSubmission('tea', 't', 5, used, () => true);
    expect(resLongShort.valid).toBe(false);
    expect(resLongShort.error).toBe('too_short');
  });

  it('rejects words not found in dictionary with specific feedback (WCB-4)', () => {
    const used = new Set<string>();
    const res = validateWordChainSubmission('txzqp', 't', 3, used, mockDict);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('not_in_dict');
    expect(res.message).toContain('not found in the dictionary');
  });

  it('configures round twists matching WCB-2 specifications', () => {
    const r1 = getRoundTwist(1);
    expect(r1.name).toBe('Classic');
    expect(r1.minWordLength).toBe(3);
    expect(r1.initialTurnSecs).toBe(10);
    expect(r1.minTurnSecs).toBe(4);

    const r2 = getRoundTwist(2);
    expect(r2.name).toBe('Long Words');
    expect(r2.minWordLength).toBe(5);
    expect(r2.initialTurnSecs).toBe(13);
    expect(r2.minTurnSecs).toBe(6);

    const r3 = getRoundTwist(3);
    expect(r3.name).toBe('Speed Round');
    expect(r3.minWordLength).toBe(3);
    expect(r3.initialTurnSecs).toBe(7);
    expect(r3.minTurnSecs).toBe(3);
  });

  it('provides 200 unambiguous common starter words in pool (WCB-3)', () => {
    expect(STARTER_WORDS.length).toBe(200);
    STARTER_WORDS.forEach((word) => {
      expect(word.length).toBeGreaterThanOrEqual(3);
      expect(/^[a-z]+$/.test(word)).toBe(true);
    });
  });

  it('computes word chain scores including placement, words played, and longest word bonus (WCB-1, WCB-6)', () => {
    // Winner: 1st place (100 pts) + 4 words played (4 * 10 = 40 pts) = 140 pts
    const winnerScore = computeWordChainScore(4, 1);
    expect(winnerScore).toBe(140);

    // 2nd place (60 pts) + 3 words played (30 pts) = 90 pts
    const secondScore = computeWordChainScore(3, 2);
    expect(secondScore).toBe(90);

    // 3rd place (40 pts) + 2 words played (20 pts) = 60 pts
    const thirdScore = computeWordChainScore(2, 3);
    expect(thirdScore).toBe(60);

    // 4th place (20 pts) + 1 word played (10 pts) = 30 pts
    const fourthScore = computeWordChainScore(1, 4);
    expect(fourthScore).toBe(30);

    // Longest word bonus adds +20 points
    const winnerWithLongest = winnerScore + 20;
    expect(winnerWithLongest).toBe(160);
  });
});

