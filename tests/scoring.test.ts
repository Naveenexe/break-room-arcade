import { describe, it, expect } from 'vitest';
import {
  computeGuesserScore,
  computeDrawerScore,
  computeReactionRoundScore,
  computeTypingScore,
  computeTypingWPM,
  computeQuizScore,
  computeWordChainScore,
  normalizeGuess,
  evaluateGuess,
  levenshteinDistance,
} from '../src/lib/scoring';

describe('Scoring Formulas (SRS Section 7)', () => {
  describe('Pictionary Scoring', () => {
    it('calculates guesser score accurately', () => {
      // 100 + round(150 * remaining/total) + (30 if first)
      // remaining 80s out of 80s, first correct = 100 + 150 + 30 = 280
      expect(computeGuesserScore({ remainingTimeMs: 80000, totalTimeMs: 80000, isFirstCorrect: true })).toBe(280);

      // remaining 40s out of 80s, not first = 100 + 75 + 0 = 175
      expect(computeGuesserScore({ remainingTimeMs: 40000, totalTimeMs: 80000, isFirstCorrect: false })).toBe(175);

      // remaining 0s = 100 + 0 + 0 = 100
      expect(computeGuesserScore({ remainingTimeMs: 0, totalTimeMs: 80000, isFirstCorrect: false })).toBe(100);
    });

    it('calculates drawer score with cap and bonus', () => {
      // 50 per correct guesser (capped at 300) + 50 bonus if everyone guessed
      expect(computeDrawerScore(1, false)).toBe(50);
      expect(computeDrawerScore(4, false)).toBe(200);
      expect(computeDrawerScore(4, true)).toBe(250);
      expect(computeDrawerScore(8, true)).toBe(350); // 300 cap + 50 all bonus
    });
  });

  describe('Reaction Duel Scoring', () => {
    it('awards points by rank', () => {
      expect(computeReactionRoundScore(1, false, 210)).toBe(100);
      expect(computeReactionRoundScore(2, false, 240)).toBe(80);
      expect(computeReactionRoundScore(3, false, 280)).toBe(65);
      expect(computeReactionRoundScore(4, false, 310)).toBe(50);
      expect(computeReactionRoundScore(5, false, 350)).toBe(40);
      expect(computeReactionRoundScore(6, false, 390)).toBe(30);
      expect(computeReactionRoundScore(7, false, 450)).toBe(20);
    });

    it('penalizes false start and implausible/over-time reactions', () => {
      expect(computeReactionRoundScore(1, true, 200)).toBe(0); // false start
      expect(computeReactionRoundScore(1, false, 40)).toBe(0); // under 80ms
      expect(computeReactionRoundScore(1, false, 3200)).toBe(0); // over 3s
    });
  });

  describe('Typing Race Scoring & WPM', () => {
    it('computes WPM correctly', () => {
      // 200 characters in 30 seconds: (200/5) / 0.5 = 80 WPM
      expect(computeTypingWPM(200, 30)).toBe(80);
    });

    it('computes placement points and applies accuracy penalty', () => {
      // 1st place with 95% accuracy = 100
      expect(computeTypingScore(1, true, 100, 0.95)).toBe(100);
      // 1st place with 85% accuracy (<90%) = 100 * 0.75 = 75
      expect(computeTypingScore(1, true, 100, 0.85)).toBe(75);
      // Unfinished player with 60% progress: 20 + 60*0.3 = 38
      expect(computeTypingScore(5, false, 60, 0.90)).toBe(38);
    });
  });

  describe('Quick Draw Quiz Scoring', () => {
    it('computes correct quiz score with time bonus and streak', () => {
      // 0ms elapsed out of 15000ms, streak 0 = 100 + 100 + 0 = 200
      expect(computeQuizScore(true, 0, 15000, 0)).toBe(200);

      // 7500ms elapsed out of 15000ms, streak 3 (+30) = 100 + 50 + 30 = 180
      expect(computeQuizScore(true, 7500, 15000, 3)).toBe(180);

      // streak capped at 50
      expect(computeQuizScore(true, 15000, 15000, 10)).toBe(100 + 0 + 50);

      // wrong answer = 0 without penalty, -25 with penalty
      expect(computeQuizScore(false, 3000, 15000, 0, false)).toBe(0);
      expect(computeQuizScore(false, 3000, 15000, 0, true)).toBe(-25);
    });
  });

  describe('Word Chain Blitz Scoring', () => {
    it('calculates score with word count and placement bonus', () => {
      // 5 words, 1st place = 50 + 100 = 150
      expect(computeWordChainScore(5, 1)).toBe(150);
      // 3 words, 2nd place = 30 + 60 = 90
      expect(computeWordChainScore(3, 2)).toBe(90);
    });
  });

  describe('Guess Normalization & Evaluation (PIC-6)', () => {
    it('normalizes accents, spaces, and articles', () => {
      expect(normalizeGuess('  The Umbrella! ')).toBe('umbrella');
      expect(normalizeGuess('A Café')).toBe('cafe');
      expect(normalizeGuess('An Elephant')).toBe('elephant');
    });

    it('computes Levenshtein distance correctly', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('banana', 'banan')).toBe(1);
      expect(levenshteinDistance('apple', 'apple')).toBe(0);
    });

    it('evaluates exact, close, and wrong guesses', () => {
      expect(evaluateGuess('umbrella', 'umbrella')).toBe('correct');
      expect(evaluateGuess('An Umbrella', 'umbrella')).toBe('correct');
      expect(evaluateGuess('umbrellas', 'umbrella')).toBe('correct'); // plural
      expect(evaluateGuess('umbrela', 'umbrella')).toBe('close'); // distance 1 for 5+ letters
      expect(evaluateGuess('unbrela', 'umbrella')).toBe('wrong'); // distance 2
    });
  });
});

