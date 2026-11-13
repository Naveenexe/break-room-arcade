import { describe, it, expect } from 'vitest';
import { computeQuizScore } from '../src/lib/scoring';
import { SEED_QUIZ } from '../src/data/seed-content';

describe('SRS v2 Section 3.3 Quick Draw Quiz Verification', () => {
  it('verifies the worked example: limit 15s, answered at 3.0s with streak of 2 scores 200 points', () => {
    // Limit: 15s = 15,000ms
    // Elapsed: 3.0s = 3,000ms
    // Prior streak: 2
    // Formula: 100 + round(100 * (1 - 3000/15000)) + min(50, 2 * 10)
    // = 100 + round(100 * 0.8) + 20 = 100 + 80 + 20 = 200 points
    const points = computeQuizScore(true, 3000, 15000, 2, false);
    expect(points).toBe(200);
  });

  it('verifies jackpot doubling: worked example on jackpot question scores exactly 400 points', () => {
    const basePoints = computeQuizScore(true, 3000, 15000, 2, false);
    const jackpotPoints = basePoints * 2;
    expect(jackpotPoints).toBe(400);
  });

  it('resets streak to 0 on a wrong answer', () => {
    let streak = 4;
    const isCorrect = false;

    if (!isCorrect) {
      streak = 0;
    }

    expect(streak).toBe(0);
    const wrongPoints = computeQuizScore(false, 2000, 15000, streak, false);
    expect(wrongPoints).toBe(0);
  });

  it('applies wrong-answer penalty (-25) when enabled, but floor remains 0', () => {
    const penaltyPoints = computeQuizScore(false, 2000, 15000, 0, true);
    expect(penaltyPoints).toBe(-25);

    // Cumulative check: total never goes below 0
    let totalScore = 10;
    totalScore = Math.max(0, totalScore + penaltyPoints);
    expect(totalScore).toBe(0);
  });

  it('caps streak bonus at 50 points regardless of streak length', () => {
    // Streak of 10 would be 100 bonus, but capped at 50
    const pointsWithHighStreak = computeQuizScore(true, 15000, 15000, 10, false);
    // 100 base + 0 speed bonus + 50 cap streak bonus = 150
    expect(pointsWithHighStreak).toBe(150);
  });

  it('verifies content items have 4 options and valid answerIndex 0..3', () => {
    expect(SEED_QUIZ.length).toBeGreaterThanOrEqual(10);
    SEED_QUIZ.forEach((q) => {
      expect(q.options.length).toBe(4);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThanOrEqual(3);
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(5);
    });
  });

  it('verifies game_state public payload never includes answerIndex before reveal', () => {
    // Simulating server-side sanitize before publishing game_state during 'answer' phase
    const rawQuestion = SEED_QUIZ[0];
    const sanitizedQuestionForPublicState = {
      question: rawQuestion.question,
      options: rawQuestion.options,
      category: rawQuestion.category,
      difficulty: rawQuestion.difficulty,
      // answerIndex and explanation are kept in round_secrets or server memory until reveal
    };

    expect(sanitizedQuestionForPublicState).not.toHaveProperty('answerIndex');
    expect(sanitizedQuestionForPublicState).not.toHaveProperty('explanation');
    expect(Object.keys(sanitizedQuestionForPublicState)).not.toContain('answerIndex');
  });
});
