import { describe, it, expect } from 'vitest';
import {
  computeGuesserScore,
  computeDrawerScore,
  evaluateGuess,
  normalizeGuess,
} from '../src/lib/scoring';
import {
  PICTIONARY_PALETTE,
  BRUSH_SIZES,
  ROUND_DURATION_SECS,
  getMaskedClue,
} from '../src/games/Pictionary';

describe('Pictionary Game Mechanics & Scoring (SRS v2 Section 3.4 & 7.2)', () => {
  it('computes drawer and guesser scores matching SRS Section 7.2 worked examples', () => {
    // Guesser 1: First correct, 70% time left (52.5s out of 75s)
    // 100 base + 105 (time bonus: 150 * 0.70) + 30 (first bonus) = 235 pts
    const guesser1Score = computeGuesserScore({
      remainingTimeMs: 52500,
      totalTimeMs: 75000,
      isFirstCorrect: true,
    });
    expect(guesser1Score).toBe(235);

    // Guesser 2: Second correct, 40% time left (30s out of 75s)
    // 100 base + 60 (time bonus: 150 * 0.40) + 0 (not first) = 160 pts
    const guesser2Score = computeGuesserScore({
      remainingTimeMs: 30000,
      totalTimeMs: 75000,
      isFirstCorrect: false,
    });
    expect(guesser2Score).toBe(160);

    // Drawer: 3 out of 3 guessers guess (all guessed bonus)
    // 3 * 50 = 150 + 50 (all bonus) = 200 pts
    const drawerAllScore = computeDrawerScore(3, true);
    expect(drawerAllScore).toBe(200);

    // Drawer: 2 guessers guess, not all guessed
    // 2 * 50 = 100 pts
    const drawerPartialScore = computeDrawerScore(2, false);
    expect(drawerPartialScore).toBe(100);
  });

  it('normalizes guesses stripping punctuation, accents, and leading articles (PIC-6)', () => {
    expect(normalizeGuess('A Dog')).toBe('dog');
    expect(normalizeGuess('The Elephant!')).toBe('elephant');
    expect(normalizeGuess('  An Ice Cream  ')).toBe('ice cream');
    expect(normalizeGuess('Café')).toBe('cafe');
  });

  it('evaluates guesses with exact match, plurals, and Levenshtein 1 close detection (PIC-6)', () => {
    const target = 'elephant';

    // Exact and case-insensitive
    expect(evaluateGuess('elephant', target)).toBe('correct');
    expect(evaluateGuess('ELEPHANT', target)).toBe('correct');
    expect(evaluateGuess('an elephant', target)).toBe('correct');

    // Plural match
    expect(evaluateGuess('elephants', target)).toBe('correct');

    // Close guess: Levenshtein distance 1 for words >= 5 chars
    expect(evaluateGuess('elephat', target)).toBe('close');
    expect(evaluateGuess('elephand', target)).toBe('close');

    // Far guess
    expect(evaluateGuess('giraffe', target)).toBe('wrong');
  });

  it('generates automated progressive hints at 40% and 70% elapsed (PIC-7)', () => {
    const word = 'elephant';
    const totalSecs = 75;

    // Start (0% elapsed): all underscores
    const maskStart = getMaskedClue(word, 0, totalSecs);
    expect(maskStart).toBe('_ _ _ _ _ _ _ _');

    // Hint 1 (45% elapsed >= 40%): first letter revealed
    const maskHint1 = getMaskedClue(word, 34, totalSecs);
    expect(maskHint1.startsWith('E')).toBe(true);
    expect(maskHint1.replace(/[^_]/g, '').length).toBe(7); // 7 remaining blanks

    // Hint 2 (75% elapsed >= 70%): first letter + 1 additional letter revealed
    const maskHint2 = getMaskedClue(word, 57, totalSecs);
    expect(maskHint2.startsWith('E')).toBe(true);
    expect(maskHint2.replace(/[^_]/g, '').length).toBe(6); // 6 remaining blanks
  });

  it('preserves multi-word spacing in masked clues', () => {
    const word = 'ice cream';
    const mask = getMaskedClue(word, 0, 75);
    // 3 underscores for ice, wider space, 5 underscores for cream
    expect(mask).toBe('_ _ _    _ _ _ _ _');
  });

  it('adheres to PIC-2 tool specifications (8-color palette, 3 brush sizes)', () => {
    expect(PICTIONARY_PALETTE).toHaveLength(8);
    expect(PICTIONARY_PALETTE).toContain('#1B1917'); // Ink
    expect(PICTIONARY_PALETTE).toContain('#FFFFFF'); // White
    expect(PICTIONARY_PALETTE).toContain('#FF5C35'); // Coral
    expect(PICTIONARY_PALETTE).toContain('#00D26A'); // Mint

    expect(BRUSH_SIZES).toHaveLength(3);
    expect(BRUSH_SIZES.map((b) => b.size)).toEqual([3, 7, 14]);
  });

  it('round duration is configured to 75 seconds (PIC-8)', () => {
    expect(ROUND_DURATION_SECS).toBe(75);
  });
});
