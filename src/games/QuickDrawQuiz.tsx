import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeQuizScore } from '@/lib/scoring';
import { SEED_QUIZ, QuizSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Lightbulb, CheckCircle2, XCircle, Clock } from 'lucide-react';

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

interface AnswerSubmission {
  userId: string;
  choiceIndex: number;
  elapsedMs: number;
}

export const QuickDrawQuiz: React.FC<QuickDrawQuizProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  // Synchronized questions (seeded deterministically by room id so all devices have identical question sets)
  const [questions] = useState<QuizSeedItem[]>(() => {
    // Deterministic shuffle based on room id
    let hash = 0;
    for (let i = 0; i < room.id.length; i++) hash = (hash << 5) - hash + room.id.charCodeAt(i);
    const shuffled = [...SEED_QUIZ].sort((a, b) => {
      const hA = (hash ^ a.question.length) % 100;
      const hB = (hash ^ b.question.length) % 100;
      return hA - hB;
    });
    return shuffled.slice(0, 10);
  });

  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [lockedIn, setLockedIn] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [submissions, setSubmissions] = useState<AnswerSubmission[]>([]);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  const [remainingSecs, setRemainingSecs] = useState(15);

  const questionStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<number | null>(null);
  const currentQ = questions[currentQuestionIdx];

  // Broadcast helper
  const sendBroadcast = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      const channel = supabase.channel(`quiz:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    },
    [room.id]
  );

  // Synchronized Realtime Event Bus
  useEffect(() => {
    const channel = supabase.channel(`quiz:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'submit_quiz_answer' }, ({ payload }) => {
        setSubmissions((prev) => {
          if (prev.some((s) => s.userId === payload.userId)) return prev;
          return [...prev, payload];
        });
      })
      .on('broadcast', { event: 'reveal_answers' }, ({ payload }) => {
        setIsRevealed(true);
        if (payload?.cumulativeScores) {
          setCumulativeScores(payload.cumulativeScores);
        }
      })
      .on('broadcast', { event: 'next_question' }, ({ payload }) => {
        setCurrentQuestionIdx(payload.questionIdx);
        setSelectedChoice(null);
        setLockedIn(false);
        setIsRevealed(false);
        setSubmissions([]);
        setRemainingSecs(15);
      })
      .on('broadcast', { event: 'quiz_finished' }, ({ payload }) => {
        onFinishGame(payload.finalScores);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [room.id, onFinishGame]);

  // Synchronized Timer for Each Question
  useEffect(() => {
    questionStartRef.current = timeSync.correctedNow();
    setRemainingSecs(15);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.round((timeSync.correctedNow() - questionStartRef.current) / 1000);
      const left = Math.max(0, 15 - elapsed);
      setRemainingSecs(left);

      if (left <= 5 && left > 0) {
        sound.playTick();
      }
      if (left === 0 && !isRevealed) {
        clearInterval(timerIntervalRef.current!);
        if (isHost) {
          handleHostReveal();
        }
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [currentQuestionIdx]);

  // Player Locks in Answer
  const handleSelectChoice = async (index: number) => {
    if (lockedIn || isRevealed) return;

    setSelectedChoice(index);
    setLockedIn(true);
    sound.playTick();

    const elapsed = Math.round(timeSync.correctedNow() - questionStartRef.current);
    const sub: AnswerSubmission = {
      userId,
      choiceIndex: index,
      elapsedMs: elapsed,
    };

    await sendBroadcast('submit_quiz_answer', sub as unknown as Record<string, unknown>);
  };

  // Host evaluates when all answered or time expired
  const handleHostReveal = useCallback(() => {
    const updated = { ...cumulativeScores };

    submissions.forEach((sub) => {
      const isCorrect = sub.choiceIndex === currentQ.answerIndex;
      const points = computeQuizScore(isCorrect, sub.elapsedMs, 15000, 0);
      updated[sub.userId] = (updated[sub.userId] || 0) + points;
    });

    sendBroadcast('reveal_answers', { cumulativeScores: updated });
  }, [cumulativeScores, submissions, currentQ, sendBroadcast]);

  // Check if all players answered early
  useEffect(() => {
    if (!isHost || isRevealed) return;
    if (submissions.length >= players.length && players.length > 0) {
      handleHostReveal();
    }
  }, [isHost, isRevealed, submissions.length, players.length, handleHostReveal]);

  // Sound feedback on reveal
  useEffect(() => {
    if (!isRevealed) return;
    if (selectedChoice === currentQ.answerIndex) {
      setStreakCount((s) => s + 1);
      sound.playCorrect();
    } else if (selectedChoice !== null) {
      setStreakCount(0);
      sound.playWrong();
    }
  }, [isRevealed]);

  // Host advances everyone to the next question or podium
  const handleNextQuestionOrFinish = async () => {
    if (!isHost) return;

    if (currentQuestionIdx >= questions.length - 1) {
      await sendBroadcast('quiz_finished', { finalScores: cumulativeScores });
      onFinishGame(cumulativeScores);
    } else {
      await sendBroadcast('next_question', { questionIdx: currentQuestionIdx + 1 });
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-game-quiz" />
          <span className="font-heading font-bold text-lg text-text">Quick Draw Quiz</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase font-bold text-text-muted">
            Question {currentQuestionIdx + 1}/{questions.length}
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-line text-sm font-heading font-black">
            <Clock className="w-4 h-4 text-warn" />
            <span className={remainingSecs <= 5 ? 'text-danger animate-pulse' : 'text-text'}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Question Card */}
      <div className="bg-surface p-6 md:p-8 rounded-card border-2 border-line space-y-6 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-bold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
            {currentQ.category} • Diff: {currentQ.difficulty}
          </span>
          {streakCount > 1 && (
            <span className="text-xs font-bold text-warn animate-bounce">
              🔥 {streakCount} Streak!
            </span>
          )}
        </div>

        <h2 className="text-2xl md:text-3xl font-black font-heading text-text leading-snug">
          {currentQ.question}
        </h2>

        {/* 4 Multiple Choice Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentQ.options.map((opt, idx) => {
            const isSelected = selectedChoice === idx;
            const isCorrect = isRevealed && idx === currentQ.answerIndex;
            const isWrongSelection = isRevealed && isSelected && idx !== currentQ.answerIndex;

            let btnStyle = 'border-line bg-surface-raised hover:border-text-muted/40 text-text';
            if (isSelected && !isRevealed) {
              btnStyle = 'border-primary bg-primary/20 text-text shadow-md';
            } else if (isCorrect) {
              btnStyle = 'border-success bg-success/20 text-success font-bold shadow-lg';
            } else if (isWrongSelection) {
              btnStyle = 'border-danger bg-danger/20 text-danger font-bold';
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={lockedIn || isRevealed}
                onClick={() => handleSelectChoice(idx)}
                className={`p-5 rounded-card text-left transition-all border-2 flex items-center justify-between text-base font-semibold ${btnStyle}`}
              >
                <span>{opt}</span>
                {isCorrect && <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />}
                {isWrongSelection && <XCircle className="w-5 h-5 text-danger flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Submissions Strip */}
        <div className="flex items-center gap-2 pt-2 border-t border-line">
          <span className="text-xs text-text-muted font-semibold">Answered:</span>
          <div className="flex items-center gap-1.5">
            {players.map((p) => {
              const hasAnswered = submissions.some((s) => s.userId === p.user_id);
              return (
                <div key={p.user_id} className={`transition-opacity ${hasAnswered ? 'opacity-100' : 'opacity-30'}`}>
                  <Avatar avatarId={p.profile?.avatar_id} name={p.profile?.display_name} size="sm" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Reveal Explanation */}
        {isRevealed && (
          <div className="p-4 rounded-xl bg-surface-raised border border-line space-y-1">
            <span className="text-xs uppercase font-bold text-success">Explanation</span>
            <p className="text-sm text-text-muted">{currentQ.explanation}</p>
          </div>
        )}
      </div>

      {/* Footer / Host Progression */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-muted">
          {lockedIn && !isRevealed ? (
            <span className="text-warn font-semibold">✓ Answer locked in! Waiting for other players…</span>
          ) : isRevealed ? (
            <span>Question revealed!</span>
          ) : (
            <span>Lock in quickly for maximum time bonus!</span>
          )}
        </div>

        {isHost && isRevealed ? (
          <Button variant="primary" onClick={handleNextQuestionOrFinish}>
            {currentQuestionIdx >= questions.length - 1 ? 'View Final Podium' : 'Next Question →'}
          </Button>
        ) : isRevealed ? (
          <span className="text-xs text-text-muted">Waiting for host…</span>
        ) : null}
      </div>
    </div>
  );
};
