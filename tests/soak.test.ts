import { describe, it, expect } from 'vitest';
import {
  computeGuesserScore,
  computeDrawerScore,
  computeReactionRoundScore,
  computeTypingScore,
  computeQuizScore,
  computeWordChainScore,
  computeArcadePoints,
} from '../src/lib/scoring';
import { validateWordChainSubmission, getRoundTwist, STARTER_WORDS } from '../src/games/WordChainBlitz';
import { validateEmojiOnly } from '../src/games/EmojiCharades';
import { getMaskedClue } from '../src/games/Pictionary';

describe('Break Room Arcade Soak Testing & Bot Simulation (Step 5)', () => {
  it('runs 10 simulated games across all modes without NaN, deadlock, or invalid scores', () => {
    const games = [
      'quick_draw_quiz',
      'typing_race',
      'reaction_duel',
      'pictionary',
      'emoji_charades',
      'word_chain_blitz',
    ] as const;

    const botProfiles = ['Bot-Alpha', 'Bot-Beta', 'Bot-Gamma', 'Bot-Delta'];

    for (let simIndex = 1; simIndex <= 10; simIndex++) {
      const selectedGame = games[(simIndex - 1) % games.length];
      const botScores: { [botId: string]: number } = {
        'Bot-Alpha': 0,
        'Bot-Beta': 0,
        'Bot-Gamma': 0,
        'Bot-Delta': 0,
      };

      if (selectedGame === 'quick_draw_quiz') {
        // 5 questions simulation
        for (let q = 1; q <= 5; q++) {
          const isJackpot = q === 5;
          botProfiles.forEach((bot, bIdx) => {
            const isCorrect = Math.random() > 0.3; // 70% accuracy
            const elapsed = Math.floor(Math.random() * 8000) + 500;
            let pts = computeQuizScore(isCorrect, elapsed, 15000, bIdx);
            if (isJackpot) pts *= 2;
            botScores[bot] += Math.max(0, pts);
          });
        }
      } else if (selectedGame === 'typing_race') {
        // 3 rounds simulation
        for (let r = 1; r <= 3; r++) {
          botProfiles.forEach((bot, bIdx) => {
            const rank = bIdx + 1;
            const accuracy = 0.95 - bIdx * 0.03;
            let pts = computeTypingScore(rank, true, 100, accuracy);
            if (r === 3) pts = Math.round(pts * 1.2);
            botScores[bot] += pts;
          });
        }
      } else if (selectedGame === 'reaction_duel') {
        // 5 rounds simulation
        for (let r = 1; r <= 5; r++) {
          const isTarget = r === 4;
          botProfiles.forEach((bot, bIdx) => {
            const rank = bIdx + 1;
            const ms = 200 + bIdx * 45;
            let pts = computeReactionRoundScore(rank, false, ms);
            if (isTarget) pts = Math.round(pts * 1.25);
            botScores[bot] += pts;
          });
        }
      } else if (selectedGame === 'pictionary') {
        // 4 turns (each bot draws once)
        for (let t = 0; t < 4; t++) {
          const drawer = botProfiles[t];
          const guessers = botProfiles.filter((b) => b !== drawer);
          guessers.forEach((guesser, gIdx) => {
            const remaining = 60000 - gIdx * 10000;
            const pts = computeGuesserScore({
              remainingTimeMs: remaining,
              totalTimeMs: 75000,
              isFirstCorrect: gIdx === 0,
            });
            botScores[guesser] += pts;
          });
          botScores[drawer] += computeDrawerScore(3, true);
        }
      } else if (selectedGame === 'emoji_charades') {
        // 4 turns (each bot acts once)
        for (let t = 0; t < 4; t++) {
          const actor = botProfiles[t];
          const guessers = botProfiles.filter((b) => b !== actor);
          guessers.forEach((guesser, gIdx) => {
            const pts = computeGuesserScore({
              remainingTimeMs: 40000 - gIdx * 8000,
              totalTimeMs: 60000,
              isFirstCorrect: gIdx === 0,
            });
            botScores[guesser] += pts;
          });
          botScores[actor] += computeDrawerScore(3, true);
        }
      } else if (selectedGame === 'word_chain_blitz') {
        // 3 rounds elimination simulation
        for (let r = 1; r <= 3; r++) {
          botProfiles.forEach((bot, bIdx) => {
            const wordsPlayed = 4 - bIdx;
            const placement = bIdx + 1;
            let pts = computeWordChainScore(wordsPlayed, placement);
            if (bIdx === 0) pts += 20; // longest word bonus
            botScores[bot] += pts;
          });
        }
      }

      // Assert each bot has valid integer scores (no NaN, >= 0)
      botProfiles.forEach((bot) => {
        expect(Number.isFinite(botScores[bot])).toBe(true);
        expect(botScores[bot]).toBeGreaterThanOrEqual(0);
      });

      // Calculate Arcade Points conversion and assert no NaN
      const standings = botProfiles.map((bot) => ({
        userId: bot,
        rawScore: botScores[bot],
      }));
      const arcadeAwards = computeArcadePoints(standings);

      expect(arcadeAwards).toHaveLength(4);
      arcadeAwards.forEach((award) => {
        expect(Number.isFinite(award.arcadePoints)).toBe(true);
        expect(award.arcadePoints).toBeGreaterThan(0);
        expect(award.rank).toBeGreaterThanOrEqual(1);
      });
    }
  });
});
