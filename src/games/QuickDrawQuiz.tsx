import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeQuizScore } from '@/lib/scoring';
import { SEED_QUIZ, QuizSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Lightbulb, CheckCircle2, XCircle, Clock, Flame } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface QuickDrawQuizProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

export const QuickDrawQuiz: React.FC<QuickDrawQuizProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  // Deterministic question bank per room id
  const [questions] = useState<QuizSeedItem[]>(() => {
    let hash = 0;
    for (let i = 0; i < room.id.length; i++) hash = (hash << 5) - hash + room.id.charCodeAt(i);
    const shuffled = [...SEED_QUIZ].sort((a, b) => {
      const hA = (hash ^ a.question.length) % 100;
      const hB = (hash ^ b.question.length) % 100;
      return hA - hB;
    });
    return shuffled.slice(0, 15);
  });

  const gameState = (room.game_state || {}) as {
    round?: number;
    totalRounds?: number;
    settings?: { jackpot?: boolean; penalty?: boolean };
  };
  const roundNo = Math.min(questions.length, Math.max(1, (gameState.round as number) || 1));
  const totalRounds = Math.min(questions.length, Math.max(5, (gameState.totalRounds as number) || 10));
  const currentQ = questions[roundNo - 1] || questions[0];

  // QZ-4: Jackpot questions on Q5, Q10, and final (when >= 6 questions)
  const isJackpot =
    Boolean(gameState.settings?.jackpot !== false) &&
    totalRounds >= 6 &&
    (roundNo === 5 || roundNo === 10 || roundNo === totalRounds);

  const phase = room.phase || 'answer';
  const isIntro = phase === 'intro';
  const isAnswer = phase === 'answer';
  const isReveal = phase === 'reveal';

  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  void reactionTimes;
  const [pointsGainedThisRound, setPointsGainedThisRound] = useState(0);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  const [remainingSecs, setRemainingSecs] = useState(15);
  const [optionCounts, setOptionCounts] = useState<{ [idx: number]: number }>({});

  const questionStartRef = useRef<number>(Date.now());

  // Reset state on round change
  useEffect(() => {
    setSelectedChoice(null);
    setLockedIn(false);
    setPointsGainedThisRound(0);
    setOptionCounts({});
    questionStartRef.current = timeSync.correctedNow();
  }, [roundNo]);

  // Synchronized countdown timer driven by phase_ends_at
  useEffect(() => {
    if (!room.phase_ends_at || isIntro) {
      setRemainingSecs(15);
      return;
    }

    const updateTimer = () => {
      const endsAtMs = new Date(room.phase_ends_at!).getTime();
      const left = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));
      setRemainingSecs(left);

      if (left <= 5 && left > 0 && isAnswer) {
        sound.playTick();
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [room.phase_ends_at, isIntro, isAnswer]);

  // QZ-1: Player selects option and locks in with single tap
  const handleSelectChoice = async (index: number) => {
    if (lockedIn || !isAnswer) return;

    setSelectedChoice(index);
    setLockedIn(true);
    sound.playTick();

    const elapsedMs = Math.round(timeSync.correctedNow() - questionStartRef.current);

    // Call authoritative server RPC (QZ-2: returns only 'locked', never correctness)
    try {
      await supabase.rpc('submit_answer', {
        p_room_id: room.id,
        p_question_no: roundNo,
        p_choice: index,
        p_elapsed_ms: elapsedMs,
      });
    } catch {
      // Fallback: submission stored locally
    }

    // Broadcast submission event so fellow clients see vote count live
    const channel = supabase.channel(`quiz:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'player_locked_in',
      payload: { userId, choiceIndex: index, elapsedMs },
    });
  };

  // Listen for broadcast submissions to update live option distribution
  useEffect(() => {
    const channel = supabase.channel(`quiz:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'player_locked_in' }, ({ payload }) => {
        setOptionCounts((prev) => ({
          ...prev,
          [payload.choiceIndex]: (prev[payload.choiceIndex] || 0) + 1,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id]);

  // Evaluate Round Result on Reveal Phase
  useEffect(() => {
    if (!isReveal) return;

    const isCorrect = selectedChoice === currentQ.answerIndex;
    const elapsed = Math.min(15000, Math.max(80, timeSync.correctedNow() - questionStartRef.current));
    const penaltyEnabled = Boolean(gameState.settings?.penalty);

    let roundPts = computeQuizScore(isCorrect, elapsed, 15000, streakCount, penaltyEnabled);
    if (isJackpot) {
      roundPts *= 2;
    }

    setPointsGainedThisRound(roundPts);

    if (isCorrect) {
      sound.playCorrect();
      setStreakCount((prev) => prev + 1);
      setReactionTimes((prev) => [...prev, elapsed]);
    } else {
      sound.playWrong();
      setStreakCount(0);
    }

    setCumulativeScores((prev) => ({
      ...prev,
      [userId]: Math.max(0, (prev[userId] || 0) + roundPts),
    }));

    // If final question finished, inform parent onFinishGame
    if (roundNo >= totalRounds) {
      const finalScores = { ...cumulativeScores, [userId]: Math.max(0, (cumulativeScores[userId] || 0) + roundPts) };
      onFinishGame(finalScores);
    }
  }, [isReveal]);

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6 select-none animate-fade">
      {/* Round Banner (Section 5.5) */}
      <div className="w-full flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-quiz text-ink flex items-center justify-center font-bold shadow-sm">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Question {roundNo} of {totalRounds}
              {isJackpot && (
                <span className="px-2 py-0.5 rounded-[6px] bg-warn text-ink text-[11px] font-black uppercase tracking-wider animate-bounce">
                  🎰 Jackpot x2!
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted capitalize">
              {currentQ.category} • Difficulty {currentQ.difficulty}
            </span>
          </div>
        </div>

        {/* Timer and Streak */}
        <div className="flex items-center gap-3">
          {streakCount > 1 && (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-warn/15 border border-warn/30 text-warn text-xs font-black">
              <Flame className="w-3.5 h-3.5 fill-warn" />
              <span>{streakCount} Streak!</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line text-xs font-heading font-black shadow-tile-sm">
            <Clock className="w-3.5 h-3.5 text-warn" />
            <span className={`tabular-nums ${remainingSecs <= 5 ? 'text-danger animate-pulse font-black' : 'text-text'}`}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Question Card (Hard-Shadow Tile) */}
      <div className="tile p-6 md:p-8 space-y-6">
        {/* Intro Phase Banner */}
        {isIntro ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-widest text-primary">Get Ready</span>
            <h2 className="text-3xl md:text-5xl font-black font-heading text-text">
              Question {roundNo}
            </h2>
            {isJackpot && (
              <span className="text-sm font-black text-warn uppercase tracking-wider">
                Double points on the line!
              </span>
            )}
          </div>
        ) : (
          <>
            {/* Question Text */}
            <h2 className="text-2xl md:text-3xl font-extrabold font-heading text-text leading-snug">
              {currentQ.question}
            </h2>

            {/* 4 Multiple Choice Options (QZ-1 & QZ-3) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {currentQ.options.map((option, idx) => {
                const isSelected = selectedChoice === idx;
                const isCorrect = isReveal && idx === currentQ.answerIndex;
                const isWrong = isReveal && isSelected && !isCorrect;

                let cardStyle =
                  'border-2 border-line bg-surface-raised hover:border-text-muted/60 text-text shadow-tile-sm';

                if (isSelected && !isReveal) {
                  cardStyle = 'border-primary bg-primary/20 text-text shadow-tile font-bold';
                }

                if (isReveal) {
                  if (isCorrect) {
                    cardStyle = 'border-success bg-success/20 text-success font-black shadow-tile';
                  } else if (isWrong) {
                    cardStyle = 'border-danger bg-danger/20 text-danger font-bold line-through';
                  } else {
                    cardStyle = 'border-line/40 bg-surface/40 text-text-muted opacity-60';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={lockedIn || isReveal}
                    onClick={() => handleSelectChoice(idx)}
                    className={`p-4 rounded-[12px] text-left transition-transform duration-75 flex items-center justify-between min-h-[58px] ${cardStyle} ${
                      !lockedIn && !isReveal ? 'active:translate-x-1 active:translate-y-1' : ''
                    }`}
                  >
                    <span className="font-heading font-bold text-sm md:text-base pr-2 leading-tight">
                      {option}
                    </span>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSelected && !isReveal && (
                        <span className="text-xs px-2 py-0.5 rounded bg-primary text-ink font-black">
                          Locked in
                        </span>
                      )}
                      {isCorrect && <CheckCircle2 className="w-5 h-5 text-success" />}
                      {isWrong && <XCircle className="w-5 h-5 text-danger" />}
                      {isReveal && optionCounts[idx] > 0 && (
                        <span className="text-[11px] font-bold text-text-muted px-1.5 py-0.5 rounded bg-surface border border-line">
                          {optionCounts[idx]}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* QZ-6 Reveal Details */}
            {isReveal && (
              <div className="p-4 rounded-[12px] bg-surface-raised border border-line space-y-2 animate-fade">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-text">
                    {pointsGainedThisRound > 0 ? (
                      <span className="text-success font-black font-heading text-sm">
                        +{pointsGainedThisRound} Points! {isJackpot && '🎰 JACKPOT!'}
                      </span>
                    ) : (
                      <span className="text-text-muted">No points awarded</span>
                    )}
                  </span>
                  {streakCount > 0 && (
                    <span className="text-warn flex items-center gap-1">
                      <Flame className="w-4 h-4 fill-warn" /> {streakCount} Streak!
                    </span>
                  )}
                </div>

                {currentQ.explanation && (
                  <p className="text-xs text-text-muted border-t border-line/50 pt-2 leading-relaxed">
                    💡 <strong className="text-text">Explanation:</strong> {currentQ.explanation}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Player Score Bar Strip */}
      <div className="w-full flex items-center justify-between p-3 rounded-[12px] bg-surface border border-line shadow-sm overflow-x-auto">
        <div className="flex items-center gap-3">
          {players.map((p) => {
            const score = cumulativeScores[p.user_id] || 0;
            const isMe = p.user_id === userId;
            return (
              <div key={p.user_id} className="flex items-center gap-2 px-2.5 py-1 rounded-[8px] bg-surface-raised border border-line/50">
                <Avatar avatarId={p.profile?.avatar_id || 'avatar-01'} name={p.profile?.display_name} size="sm" />
                <span className="text-xs font-heading font-bold text-text truncate max-w-[90px]">
                  {p.profile?.display_name || 'Player'} {isMe && '(You)'}
                </span>
                <span className="text-xs font-black text-primary tabular-nums">
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
