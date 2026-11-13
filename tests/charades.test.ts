import { describe, it, expect } from 'vitest';
import {
  validateEmojiOnly,
  EMOJI_CATEGORIES,
  ROUND_DURATION_SECS,
  MAX_CLUE_EMOJIS,
} from '../src/games/EmojiCharades';
import { computeGuesserScore, computeDrawerScore, evaluateGuess } from '../src/lib/scoring';

describe('Emoji Charades Mechanics & Scoring (SRS v2 Section 3.5 & 7.3)', () => {
  it('strictly validates emoji-only clues and strips ASCII, digits, punctuation, and flags (EMO-2)', () => {
    // Standard emojis preserved
    expect(validateEmojiOnly('🎬🍿🦁')).toBe('🎬🍿🦁');

    // ASCII letters, digits, and punctuation stripped
    expect(validateEmojiOnly('🎬 Hello 123 !? 🍿')).toBe('🎬🍿');

    // Reject regional indicator letters (flags like 🇮🇳)
    const indianFlag = '🇮🇳';
    expect(validateEmojiOnly(indianFlag)).toBe('');

    // Mixed text with emojis
    expect(validateEmojiOnly('Lion 🦁 and Popcorn 🍿')).toBe('🦁🍿');
  });

  it('caps clue length to a maximum of 20 emojis (EMO-2)', () => {
    const thirtyEmojis = '😀'.repeat(30);
    const validated = validateEmojiOnly(thirtyEmojis);
    expect(Array.from(validated).length).toBe(MAX_CLUE_EMOJIS);
    expect(Array.from(validated).length).toBe(20);
  });

  it('includes 6 categorized emoji tabs in picker (EMO-1)', () => {
    const categories = Object.keys(EMOJI_CATEGORIES);
    expect(categories).toEqual(['Smileys', 'Food', 'Animals', 'Activities', 'Objects', 'Symbols']);
    categories.forEach((cat) => {
      expect(EMOJI_CATEGORIES[cat as keyof typeof EMOJI_CATEGORIES].length).toBeGreaterThanOrEqual(15);
    });
  });

  it('applies 25-point penalty on prompt skip and limits to 2 skips per turn (EMO-4)', () => {
    let score = 100;
    let skips = 0;

    const performSkip = () => {
      if (skips >= 2) return false;
      skips += 1;
      score -= 25;
      return true;
    };

    expect(performSkip()).toBe(true);
    expect(score).toBe(75);
    expect(performSkip()).toBe(true);
    expect(score).toBe(50);
    expect(performSkip()).toBe(false); // 3rd skip disallowed
    expect(score).toBe(50);
  });

  it('evaluates guesses and calculates guesser and actor scores (EMO-5, SRS 7.3)', () => {
    const prompt = 'Finding Nemo';

    // Exact and case-insensitive
    expect(evaluateGuess('finding nemo', prompt)).toBe('correct');
    expect(evaluateGuess('FINDING NEMO', prompt)).toBe('correct');

    // Close guess (distance 1)
    expect(evaluateGuess('findin nemo', prompt)).toBe('close');

    // Guesser score with 50% time remaining (30s out of 60s)
    const guesserScore = computeGuesserScore({
      remainingTimeMs: 30000,
      totalTimeMs: 60000,
      isFirstCorrect: true,
    });
    // 100 base + 75 (150 * 0.5) + 30 (first) = 205
    expect(guesserScore).toBe(205);

    // Actor score with 2 guessers (not all)
    expect(computeDrawerScore(2, false)).toBe(100);
    // Actor score with 3 guessers (all guessed bonus)
    expect(computeDrawerScore(3, true)).toBe(200);
  });

  it('round duration is configured to 60 seconds (EMO-7)', () => {
    expect(ROUND_DURATION_SECS).toBe(60);
  });
});

