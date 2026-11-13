import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sound } from '@/lib/sound';
import { dictionary } from '@/data/dictionary';
import { computeWordChainScore } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import {
  Link2,
  Clock,
  Send,
  AlertCircle,
  Zap,
  Flame,
  CheckCircle2,
} from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface WordChainBlitzProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

export interface RoundTwistConfig {
  name: string;
  minWordLength: number;
  initialTurnSecs: number;
  minTurnSecs: number;
  shrinkPerTurn: number;
  description: string;
}

// WCB-2: Round Twists
export function getRoundTwist(roundNo: number): RoundTwistConfig {
  if (roundNo === 1) {
    return {
      name: 'Classic',
      minWordLength: 3,
      initialTurnSecs: 10,
      minTurnSecs: 4,
      shrinkPerTurn: 0.5,
      description: 'Standard link! Min 3 letters, timer shrinks to 4s.',
    };
  }
  if (roundNo === 2) {
    return {
      name: 'Long Words',
      minWordLength: 5,
      initialTurnSecs: 13,
      minTurnSecs: 6,
      shrinkPerTurn: 0.5,
      description: 'Big vocabulary! Min 5 letters, timer starts at 13s.',
    };
  }
  return {
    name: 'Speed Round',
    minWordLength: 3,
    initialTurnSecs: 7,
    minTurnSecs: 3,
    shrinkPerTurn: 0.5,
    description: 'Lightning reflex! Starts at 7s, shrinks down to 3s!',
  };
}

// WCB-3: 200 Unambiguous Common Starter Words Pool
export const STARTER_WORDS = [
  'arcade', 'beacon', 'candle', 'dragon', 'empire', 'falcon', 'galaxy', 'harbor',
  'island', 'jungle', 'knight', 'legend', 'meteor', 'nebula', 'orange', 'planet',
  'quartz', 'rocket', 'shadow', 'timber', 'umbrella', 'valley', 'wizard', 'zenith',
  'anchor', 'bridge', 'castle', 'desert', 'engine', 'forest', 'garden', 'helmet',
  'impact', 'jacket', 'kettle', 'ladder', 'monkey', 'needle', 'oxygen', 'parade',
  'quiver', 'rabbit', 'sailor', 'tunnel', 'urn', 'violet', 'walnut', 'xylophone',
  'yellow', 'zipper', 'almond', 'badger', 'cactus', 'donkey', 'eagles', 'feather',
  'guitar', 'hammer', 'iguana', 'jaguar', 'kitten', 'lizard', 'magnet', 'nickel',
  'ostrich', 'pigeon', 'quiche', 'ribbon', 'shield', 'ticket', 'unicorn', 'vacuum',
  'whistle', 'xerox', 'yogurt', 'zombie', 'acorn', 'barrel', 'clover', 'dolphin',
  'elixir', 'fossil', 'goblet', 'hunter', 'insect', 'jigsaw', 'kernel', 'lantern',
  'marble', 'nectar', 'origami', 'potion', 'quarry', 'radish', 'statue', 'target',
  'urchin', 'vessel', 'weapon', 'yacht', 'safari', 'ballet', 'cradle', 'dynamo',
  'enigma', 'flame', 'garage', 'horizon', 'iceberg', 'journey', 'katana', 'lagoon',
  'monarch', 'nucleus', 'octopus', 'pyramid', 'quokka', 'ravine', 'spider', 'trophy',
  'upgrade', 'volcano', 'whisper', 'yearling', 'zigzag', 'artist', 'bronze', 'cinema',
  'dancer', 'emerald', 'future', 'glider', 'heroic', 'irony', 'jockey', 'karate',
  'leopard', 'museum', 'nature', 'oracle', 'palace', 'quest', 'radar', 'samurai',
  'temple', 'utopia', 'velvet', 'wizard', 'yonder', 'zephyr', 'atom', 'breeze',
  'canvas', 'domino', 'echo', 'fable', 'gravity', 'haven', 'ivory', 'jewel',
  'koala', 'lotus', 'matrix', 'ninja', 'oasis', 'prism', 'quasar', 'relic',
  'signal', 'tower', 'unity', 'vortex', 'willow', 'yield', 'zeno', 'alpha',
  'blaze', 'comet', 'drift', 'ember', 'frost', 'grove', 'hatch', 'image',
  'karma', 'lemon', 'mirage', 'nova', 'orbit', 'pulse', 'ridge', 'spark',
  'trail', 'urban', 'vapor', 'wave', 'yarn', 'atlas', 'bloom', 'coral'
];

export interface ValidationResult {
  valid: boolean;
  error?: 'already_used' | 'invalid_letter' | 'too_short' | 'not_in_dict';
  message?: string;
}

// WCB-4: Authoritative Word Validation Helper
export function validateWordChainSubmission(
  word: string,
  requiredLetter: string,
  minWordLength: number,
  usedWords: Set<string>,
  isDictWord: (w: string) => boolean
): ValidationResult {
  const clean = word.trim().toLowerCase();

  if (usedWords.has(clean)) {
    return {
      valid: false,
      error: 'already_used',
      message: `"${clean}" has already been used in this round!`,
    };
  }

  if (!clean.startsWith(requiredLetter.toLowerCase())) {
    return {
      valid: false,
      error: 'invalid_letter',
      message: `Must start with the letter "${requiredLetter.toUpperCase()}"!`,
    };
  }

  if (clean.length < minWordLength) {
    return {
      valid: false,
      error: 'too_short',
      message: `Too short! Minimum length is ${minWordLength} letters.`,
    };
  }

  if (!isDictWord(clean)) {
    return {
      valid: false,
      error: 'not_in_dict',
      message: `"${clean}" was not found in the dictionary.`,
    };
  }

  return { valid: true };
}

export const WordChainBlitz: React.FC<WordChainBlitzProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  const gameState = room.game_state || {};
  const roundNo = Math.max(1, (gameState.round as number) || 1);
  const totalRounds = 3; // WCB-1: default 3 rounds
  const twist = getRoundTwist(roundNo);

  // Alive players in the current round elimination battle
  const [activePlayers, setActivePlayers] = useState<string[]>(() => {
    return players.map((p) => p.user_id);
  });
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);

  // Words played in this round
  const [wordChain, setWordChain] = useState<string[]>(() => [
    STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)],
  ]);
  const [usedWordsSet, setUsedWordsSet] = useState<Set<string>>(new Set());

  // Input, timing and validation feedback
  const [currentWordInput, setCurrentWordInput] = useState('');
  const [validationError, setValidationError] = useState<ValidationResult | null>(null);
  const [reportedWord, setReportedWord] = useState<string | null>(null);
  const [turnLimitSecs, setTurnLimitSecs] = useState(twist.initialTurnSecs);
  const [remainingSecs, setRemainingSecs] = useState(twist.initialTurnSecs);

  // Stats and Cumulative Points
  const [wordCounts, setWordCounts] = useState<{ [uid: string]: number }>({});
  const [longestWordInfo, setLongestWordInfo] = useState<{ word: string; userId: string }>({
    word: '',
    userId: '',
  });
  const [eliminatedOrder, setEliminatedOrder] = useState<string[]>([]);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  const [isDictLoaded, setIsDictLoaded] = useState(false);
  void cumulativeScores;
  void isDictLoaded;

  const turnTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTurnUserId = activePlayers[currentTurnIdx];
  const isMyTurn = currentTurnUserId === userId;
  const currentActivePlayer = players.find((p) => p.user_id === currentTurnUserId);

  const previousWord = wordChain[wordChain.length - 1] || 'arcade';
  const requiredLetter = previousWord[previousWord.length - 1].toUpperCase();

  // Load Dictionary (WCB-4)
  useEffect(() => {
    dictionary.load().then((loaded) => setIsDictLoaded(loaded));
  }, []);

  // Initialize Round
  useEffect(() => {
    const starter = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)];
    setWordChain([starter]);
    setUsedWordsSet(new Set([starter.toLowerCase()]));
    setActivePlayers(players.map((p) => p.user_id));
    setCurrentTurnIdx(0);
    setEliminatedOrder([]);
    setTurnLimitSecs(twist.initialTurnSecs);
    setRemainingSecs(twist.initialTurnSecs);
    setLongestWordInfo({ word: '', userId: '' });
    setWordCounts({});
    setValidationError(null);
    setReportedWord(null);
  }, [roundNo]);

  // Turn Timer Loop (WCB-2 & WCB-5)
  useEffect(() => {
    if (activePlayers.length <= 1) return;

    setRemainingSecs(turnLimitSecs);
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);

    turnTimerRef.current = window.setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          clearInterval(turnTimerRef.current!);
          eliminateCurrentPlayer();
          return 0;
        }
        if (prev <= 3) sound.playTick();
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [currentTurnIdx, turnLimitSecs, activePlayers.length]);

  // Focus input when my turn arrives
  useEffect(() => {
    if (isMyTurn && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMyTurn]);

  // Realtime Broadcast Channel Listener
  useEffect(() => {
    const channel = supabase.channel(`wordchain:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'word_played' }, ({ payload }) => {
        setWordChain((prev) => [...prev, payload.word]);
        setUsedWordsSet((prev) => new Set([...prev, payload.word.toLowerCase()]));
        setWordCounts((prev) => ({
          ...prev,
          [payload.userId]: (prev[payload.userId] || 0) + 1,
        }));

        if (payload.word.length > longestWordInfo.word.length) {
          setLongestWordInfo({ word: payload.word, userId: payload.userId });
        }

        // Shrink turn timer according to twist
        setTurnLimitSecs((prev) => Math.max(twist.minTurnSecs, prev - twist.shrinkPerTurn));
        setCurrentTurnIdx((idx) => (idx + 1) % activePlayers.length);
        sound.playCorrect();
      })
      .on('broadcast', { event: 'player_eliminated' }, ({ payload }) => {
        handleElimination(payload.userId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, activePlayers.length, twist, longestWordInfo.word.length]);

  // WCB-5: Elimination Logic (Required Letter Stays Same!)
  const eliminateCurrentPlayer = () => {
    const eliminatedId = activePlayers[currentTurnIdx];
    handleElimination(eliminatedId);

    const channel = supabase.channel(`wordchain:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'player_eliminated',
      payload: { userId: eliminatedId },
    });
  };

  const handleElimination = (eliminatedId: string) => {
    sound.playWrong();
    setEliminatedOrder((prev) => [...prev, eliminatedId]);

    const remaining = activePlayers.filter((id) => id !== eliminatedId);
    setActivePlayers(remaining);

    // If only 1 survivor left -> Round ends!
    if (remaining.length <= 1) {
      const winnerId = remaining[0] || eliminatedId;
      finishRound(winnerId, [...eliminatedOrder, eliminatedId]);
    } else {
      // Next clockwise living player plays off the SAME required letter
      setCurrentTurnIdx((idx) => idx % remaining.length);
    }
  };

  // Complete Round and Award Scores (WCB-1 & WCB-6)
  const finishRound = (winnerId: string, eliminatedList: string[]) => {
    sound.playApplause();

    // Placements: Winner is #1, then reverse of eliminated list
    const roundScores: { [uid: string]: number } = {};
    const reversedElim = [...eliminatedList].reverse(); // [2nd, 3rd, 4th...]

    // 1st place: 100 pts + word count * 10
    roundScores[winnerId] = computeWordChainScore(wordCounts[winnerId] || 0, 1);

    // 2nd, 3rd, etc.
    reversedElim.forEach((uid, idx) => {
      if (uid === winnerId) return;
      const rank = idx + 2;
      roundScores[uid] = computeWordChainScore(wordCounts[uid] || 0, rank);
    });

    // WCB-6: Longest word bonus (+20 pts)
    if (longestWordInfo.userId && roundScores[longestWordInfo.userId] !== undefined) {
      roundScores[longestWordInfo.userId] += 20;
    }

    setCumulativeScores((prev) => {
      const updated = { ...prev };
      Object.entries(roundScores).forEach(([uid, score]) => {
        updated[uid] = (updated[uid] || 0) + score;
      });

      if (roundNo >= totalRounds) {
        onFinishGame(updated);
      }
      return updated;
    });
  };

  // WCB-4: Word Submission
  const handleSubmitWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;

    const trimmed = currentWordInput.trim().toLowerCase();
    setValidationError(null);

    // Validate word
    const validation = validateWordChainSubmission(
      trimmed,
      requiredLetter,
      twist.minWordLength,
      usedWordsSet,
      (w) => dictionary.isValid(w)
    );

    if (!validation.valid) {
      setValidationError(validation);
      sound.playWrong();
      return;
    }

    // Valid word!
    sound.playCorrect();
    setWordChain((prev) => [...prev, trimmed]);
    setUsedWordsSet((prev) => new Set([...prev, trimmed]));
    setWordCounts((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) + 1,
    }));

    if (trimmed.length > longestWordInfo.word.length) {
      setLongestWordInfo({ word: trimmed, userId });
    }

    setCurrentWordInput('');

    // Broadcast word played
    const channel = supabase.channel(`wordchain:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'word_played',
      payload: { word: trimmed, userId },
    });

    // Shrink turn timer and advance turn
    setTurnLimitSecs((prev) => Math.max(twist.minTurnSecs, prev - twist.shrinkPerTurn));
    setCurrentTurnIdx((idx) => (idx + 1) % activePlayers.length);
  };

  // WCB-7: Dictionary Miss Reporting
  const handleReportMiss = () => {
    if (!validationError?.message || !currentWordInput) return;
    const missWord = currentWordInput.trim().toLowerCase();
    setReportedWord(missWord);

    try {
      const stored = JSON.parse(localStorage.getItem('bra_dictionary_misses') || '[]');
      if (!stored.includes(missWord)) {
        stored.push(missWord);
        localStorage.setItem('bra_dictionary_misses', JSON.stringify(stored));
      }
    } catch {
      // Ignore localStorage glitches
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full py-4 space-y-4 animate-fade select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-wordchain text-ink flex items-center justify-center font-bold shadow-sm">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Round {roundNo} of {totalRounds} •{' '}
              <span className="text-primary">{twist.name} Twist</span>
            </span>
            <span className="text-xs text-text-muted">{twist.description}</span>
          </div>
        </div>

        {/* Turn Timer Badge */}
        <div className="flex items-center gap-2 text-xs font-heading font-black px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line shadow-tile-sm">
          <Clock className={`w-3.5 h-3.5 ${remainingSecs <= 3 ? 'text-danger animate-pulse' : 'text-primary'}`} />
          <span className="tabular-nums">{remainingSecs}s</span>
        </div>
      </div>

      {/* Survivor Ring & Active Turn Bar */}
      <div className="p-3.5 rounded-card bg-surface-raised border border-line flex flex-wrap items-center justify-between gap-3 shadow-tile-sm">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
            Survivors ({activePlayers.length}/{players.length}):
          </span>
          <div className="flex items-center gap-1.5">
            {players.map((p) => {
              const isAlive = activePlayers.includes(p.user_id);
              const isCurrentTurn = p.user_id === currentTurnUserId;
              return (
                <div
                  key={p.user_id}
                  className={`relative p-1 rounded-full border-2 transition-transform ${
                    isCurrentTurn
                      ? 'border-primary ring-2 ring-primary/40 scale-110 shadow-md'
                      : isAlive
                      ? 'border-line bg-surface'
                      : 'border-danger/40 opacity-40 grayscale'
                  }`}
                  title={`${p.profile?.display_name || 'Player'} (${isAlive ? 'Alive' : 'Eliminated'})`}
                >
                  <Avatar avatarId={p.profile?.avatar_id || 'avatar-01'} size="sm" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Longest Word Badge (WCB-6) */}
        {longestWordInfo.word && (
          <div className="flex items-center gap-1.5 text-xs font-heading font-bold text-warn bg-surface px-2.5 py-1 rounded-button border border-line">
            <Flame className="w-3.5 h-3.5" />
            <span>
              Longest: &quot;{longestWordInfo.word}&quot; (+20 pts)
            </span>
          </div>
        )}
      </div>

      {/* Chain Stream & Big Required Letter Card */}
      <div className="p-6 md:p-8 rounded-card bg-surface border-2 border-line shadow-tile flex flex-col items-center justify-center space-y-6 text-center">
        {/* Previous Word Display */}
        <div className="space-y-1">
          <span className="text-xs font-black uppercase tracking-widest text-text-muted">
            Previous Linked Word
          </span>
          <div className="text-3xl md:text-5xl font-black font-heading text-text capitalize tracking-wide flex items-center justify-center gap-1">
            {previousWord.slice(0, -1)}
            <span className="text-primary underline decoration-4 decoration-primary">
              {previousWord.slice(-1)}
            </span>
          </div>
        </div>

        {/* Required Letter Callout */}
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-card bg-primary text-ink border-4 border-ink flex flex-col items-center justify-center shadow-tile transform hover:scale-105 transition-transform">
          <span className="text-[10px] font-black uppercase tracking-wider text-ink/75">
            Starts With
          </span>
          <span className="text-5xl md:text-6xl font-black font-heading leading-none">
            {requiredLetter}
          </span>
        </div>

        {/* Turn Prompt Message */}
        <div className="font-heading font-black text-sm">
          {isMyTurn ? (
            <span className="text-primary flex items-center justify-center gap-1 text-base animate-pulse">
              <Zap className="w-4 h-4" /> It is YOUR turn! Type a word starting with &quot;{requiredLetter}&quot;!
            </span>
          ) : (
            <span className="text-text-muted">
              Waiting for{' '}
              <strong className="text-text">{currentActivePlayer?.profile?.display_name || 'Player'}</strong>…
            </span>
          )}
        </div>

        {/* Word Submission Form */}
        {isMyTurn && (
          <form
            onSubmit={handleSubmitWord}
            className="w-full max-w-md flex flex-col items-center space-y-3"
          >
            <div className="w-full flex items-center gap-2">
              <Input
                ref={inputRef}
                value={currentWordInput}
                onChange={(e) => {
                  setCurrentWordInput(e.target.value);
                  setValidationError(null);
                }}
                placeholder={`Type a word starting with '${requiredLetter}'…`}
                className="text-base font-bold text-center h-12"
                autoComplete="off"
                spellCheck="false"
              />
              <Button type="submit" variant="primary" className="h-12 px-5 font-black">
                <Send className="w-4 h-4 mr-1" /> Link
              </Button>
            </div>

            {/* Validation Rejection Feedback (WCB-4) */}
            {validationError && (
              <div className="w-full p-2.5 rounded-[8px] bg-danger/10 border border-danger/30 text-danger text-xs font-heading font-bold flex items-center justify-between animate-fade">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{validationError.message}</span>
                </div>

                {/* Challenge / Report Word Button (WCB-7) */}
                {validationError.error === 'not_in_dict' && !reportedWord && (
                  <button
                    type="button"
                    onClick={handleReportMiss}
                    className="text-[11px] underline font-black text-ink hover:text-primary whitespace-nowrap ml-2"
                  >
                    Report word
                  </button>
                )}
                {reportedWord && (
                  <span className="text-[10px] text-success font-black flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Reported!
                  </span>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Chain History Roll */}
      <div className="tile p-4 bg-surface-raised space-y-2">
        <span className="text-xs font-black uppercase tracking-wider text-text-muted">
          Round Word Chain ({wordChain.length} links)
        </span>
        <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto">
          {wordChain.map((w, idx) => (
            <span
              key={idx}
              className={`px-2.5 py-1 rounded-[6px] text-xs font-mono font-bold border ${
                idx === wordChain.length - 1
                  ? 'bg-primary text-ink border-ink font-black shadow-sm'
                  : 'bg-surface border-line text-text'
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
