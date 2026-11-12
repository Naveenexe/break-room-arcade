// Authoritative scoring formulas matching SRS Section 7

export interface GuessScoreParams {
  remainingTimeMs: number;
  totalTimeMs: number;
  isFirstCorrect: boolean;
}

export function computeGuesserScore({
  remainingTimeMs,
  totalTimeMs,
  isFirstCorrect,
}: GuessScoreParams): number {
  const ratio = Math.max(0, Math.min(1, remainingTimeMs / totalTimeMs));
  const base = 100;
  const timeBonus = Math.round(150 * ratio);
  const firstBonus = isFirstCorrect ? 30 : 0;
  return base + timeBonus + firstBonus;
}

export function computeDrawerScore(correctGuessersCount: number, allGuessed: boolean): number {
  const perGuesser = Math.min(300, correctGuessersCount * 50);
  const allBonus = allGuessed && correctGuessersCount > 0 ? 50 : 0;
  return perGuesser + allBonus;
}

export function computeReactionRoundScore(rank: number, isFalseStart: boolean, timeMs: number): number {
  if (isFalseStart || timeMs < 80 || timeMs > 3000) return 0;
  switch (rank) {
    case 1: return 100;
    case 2: return 80;
    case 3: return 65;
    case 4: return 50;
    case 5: return 40;
    case 6: return 30;
    default: return 20;
  }
}

export function computeTypingScore(
  rank: number,
  isFinished: boolean,
  progressPct: number,
  accuracy: number
): number {
  if (!isFinished) {
    return Math.round(20 + Math.max(0, Math.min(100, progressPct)) * 0.3);
  }

  let basePoints = 35;
  if (rank === 1) basePoints = 100;
  else if (rank === 2) basePoints = 80;
  else if (rank === 3) basePoints = 65;
  else if (rank === 4) basePoints = 50;

  if (accuracy < 0.90) {
    return Math.round(basePoints * 0.75);
  }
  return basePoints;
}

export function computeTypingWPM(correctChars: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  const minutes = elapsedSeconds / 60;
  return Math.round((correctChars / 5) / minutes);
}

export function computeQuizScore(
  isCorrect: boolean,
  elapsedMs: number,
  timeLimitMs: number,
  streakCount: number,
  penaltyEnabled: boolean = false
): number {
  if (!isCorrect) {
    return penaltyEnabled ? -25 : 0;
  }

  const ratio = Math.max(0, Math.min(1, elapsedMs / timeLimitMs));
  const timeBonus = Math.round(100 * (1 - ratio));
  const streakBonus = Math.min(50, Math.max(0, streakCount) * 10);

  return 100 + timeBonus + streakBonus;
}

export function computeWordChainScore(validWordCount: number, placement?: number): number {
  const wordPoints = validWordCount * 10;
  let bonus = 0;
  if (placement === 1) bonus = 100;
  else if (placement === 2) bonus = 60;
  else if (placement === 3) bonus = 40;
  else if (placement !== undefined && placement > 3) bonus = 20;

  return wordPoints + bonus;
}

/**
 * Normalizes a guess according to PIC-6:
 * Lowercase, trimmed, punctuation/accents removed, leading "a/an/the" ignored, simple plural handled.
 */
export function normalizeGuess(text: string): string {
  let normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '') // remove punctuation
    .trim()
    .replace(/\s+/g, ' ');

  // Strip leading articles
  normalized = normalized.replace(/^(a|an|the)\s+/, '');

  return normalized;
}

/**
 * Computes Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Checks guess against secret word: returns 'correct' | 'close' | 'wrong'
 */
export function evaluateGuess(guess: string, secretWord: string): 'correct' | 'close' | 'wrong' {
  const normGuess = normalizeGuess(guess);
  const normSecret = normalizeGuess(secretWord);

  if (normGuess === normSecret) return 'correct';

  // Handle simple plurals
  if (normSecret.length > 3) {
    if (normGuess + 's' === normSecret || normGuess === normSecret + 's') {
      return 'correct';
    }
    if (normGuess + 'es' === normSecret || normGuess === normSecret + 'es') {
      return 'correct';
    }
  }

  // Edit distance 1 for words of 5+ letters is "close"
  if (normSecret.length >= 5 && levenshteinDistance(normGuess, normSecret) === 1) {
    return 'close';
  }

  return 'wrong';
}

