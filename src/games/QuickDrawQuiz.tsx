import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeQuizScore } from '@/lib/scoring';
import { SEED_QUIZ, QuizSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Lightbulb, CheckCircle2, XCircle, ArrowRight, Clock } from 'lucide-react';

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
  const [questions] = useState<QuizSeedItem[]>(() => {
    // Shuffle and pick 10 questions
    return [...SEED_QUIZ].sort(() => 0.5 - Math.random()).slice(0, 10);
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

  // Reset for next question
  const startQuestion = () => {
    setSelectedChoice(null);
    setLockedIn(false);
    setIsRevealed(false);
    setSubmissions([]);
    setRemainingSecs(15);
    questionStartRef.current = timeSync.correctedNow();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.round((timeSync.correctedNow() - questionStartRef.current) / 1000);
      const left = Math.max(0, 15 - elapsed);
      setRemainingSecs(left);
      if (left <= 5 && left > 0) {
        sound.playTick();
      }
      if (left === 0) {
        clearInterval(timerIntervalRef.current!);
        revealAnswers();
      }
    }, 1000);
  };

  useEffect(() => {
    startQuestion();
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [currentQuestionIdx]);

  // Realtime subscription for submissions
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id]);

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

    setSubmissions((prev) => [...prev, sub]);

    const channel = supabase.channel(`quiz:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'submit_quiz_answer',
      payload: sub,
    });
  };

  const revealAnswers = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsRevealed(true);

    // Compute scores for this question
    const updated = { ...cumulativeScores };
    submissions.forEach((sub) => {
      const isCorrect = sub.choiceIndex === currentQ.answerIndex;
      const points = computeQuizScore(isCorrect, sub.elapsedMs, 15000, sub.userId === userId ? streakCount : 0);
      updated[sub.userId] = (updated[sub.userId] || 0) + points;

      if (sub.userId === userId) {
        if (isCorrect) {
          setStreakCount((s) => s + 1);
          sound.playCorrect();
        } else {
          setStreakCount(0);
          sound.playWrong();
        }
      }
    });

    setCumulativeScores(updated);
  };

  const nextQuestionOrFinish = () => {
    if (currentQuestionIdx >= questions.length - 1) {
      onFinishGame(cumulativeScores);
    } else {
      setCurrentQuestionIdx((q) => q + 1);
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

        {/* 4 Multiple Choice Options (QZ-1, QZ-2) */}
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

        {/* Submissions strip */}
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

        {/* Reveal Explanation (QZ-4) */}
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
            <span className="text-warn font-semibold">✓ Answer locked in! Waiting for time…</span>
          ) : isRevealed ? (
            <span>Question concluded</span>
          ) : (
            <span>Lock in quickly for maximum time bonus!</span>
          )}
        </div>

        {isHost && isRevealed && (
          <Button variant="primary" onClick={nextQuestionOrFinish}>
            {currentQuestionIdx >= questions.length - 1 ? 'View Final Podium' : 'Next Question'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
};
