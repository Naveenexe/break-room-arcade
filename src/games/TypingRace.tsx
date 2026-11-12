import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { computeTypingScore, computeTypingWPM } from '@/lib/scoring';
import { SEED_TYPING } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Flag, Trophy } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface TypingRaceProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

interface PlayerProgress {
  userId: string;
  progressPct: number;
  wpm: number;
  isFinished: boolean;
}

export const TypingRace: React.FC<TypingRaceProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  // Passage selection
  const [passage] = useState<string>(() => {
    const randomIndex = Math.floor(Math.random() * SEED_TYPING.length);
    return SEED_TYPING[randomIndex].text;
  });

  const [input, setInput] = useState('');
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(1);
  const [allProgress, setAllProgress] = useState<{ [uid: string]: PlayerProgress }>({});
  const [rankings, setRankings] = useState<{ userId: string; score: number; wpm: number; accuracy: number }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastBroadcastTimeRef = useRef<number>(0);

  // Focus input automatically
  useEffect(() => {
    inputRef.current?.focus();
    setStartTime(Date.now());
  }, []);

  // Broadcast throttled progress (TYP-4, TM-13: max 4 per second)
  const broadcastProgress = useCallback(
    async (progressPct: number, currentWpm: number, finished: boolean) => {
      const now = Date.now();
      if (now - lastBroadcastTimeRef.current < 250 && !finished) {
        return;
      }
      lastBroadcastTimeRef.current = now;

      const payload: PlayerProgress = {
        userId,
        progressPct,
        wpm: currentWpm,
        isFinished: finished,
      };

      const channel = supabase.channel(`typing:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'typing_progress',
        payload,
      });
    },
    [room.id, userId]
  );

  // Subscribe to all players' race progress
  useEffect(() => {
    const channel = supabase.channel(`typing:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'typing_progress' }, ({ payload }) => {
        setAllProgress((prev) => ({
          ...prev,
          [payload.userId]: payload,
        }));
      })
      .on('broadcast', { event: 'race_finished' }, ({ payload }) => {
        onFinishGame(payload.finalScores);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isFinished) return;

    const val = e.target.value;
    // Allow typing only up to passage length
    if (val.length > passage.length) return;

    setTotalKeystrokes((prev) => prev + 1);

    // Keystroke match validation
    const lastChar = val[val.length - 1];
    const expectedChar = passage[val.length - 1];
    if (lastChar === expectedChar) {
      setCorrectKeystrokes((prev) => prev + 1);
    }

    setInput(val);

    // Compute progress
    let correctCount = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === passage[i]) correctCount++;
      else break; // strict sequential matching
    }

    const elapsedSeconds = startTime ? Math.max(1, (Date.now() - startTime) / 1000) : 1;
    const currentWpm = computeTypingWPM(correctCount, elapsedSeconds);
    const progressPct = Math.round((correctCount / passage.length) * 100);

    setWpm(currentWpm);

    const currentAccuracy = totalKeystrokes > 0 ? (correctKeystrokes + 1) / (totalKeystrokes + 1) : 1;
    setAccuracy(currentAccuracy);

    // Finish condition: exact match of entire passage (TYP-2)
    if (val === passage) {
      setIsFinished(true);
      sound.playFanfare();
      broadcastProgress(100, currentWpm, true);
    } else {
      broadcastProgress(progressPct, currentWpm, false);
    }
  };

  // Evaluate final standings
  useEffect(() => {
    const finishedPlayers = Object.values(allProgress).filter((p) => p.isFinished);
    if (finishedPlayers.length > 0 && finishedPlayers.length === players.length) {
      // All players finished!
      const ranked = Object.values(allProgress)
        .sort((a, b) => (b.wpm || 0) - (a.wpm || 0))
        .map((p, idx) => {
          const score = computeTypingScore(idx + 1, p.isFinished, p.progressPct, accuracy);
          return {
            userId: p.userId,
            score,
            wpm: p.wpm,
            accuracy: Math.round(accuracy * 100),
          };
        });
      setRankings(ranked);
    }
  }, [allProgress, players.length, accuracy]);

  const handleFinish = async () => {
    const scoresMap: { [uid: string]: number } = {};
    rankings.forEach((r) => {
      scoresMap[r.userId] = r.score;
    });

    const channel = supabase.channel(`typing:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'race_finished',
      payload: { finalScores: scoresMap },
    });

    onFinishGame(scoresMap);
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-game-typing" />
          <span className="font-heading font-bold text-lg text-text">Typing Race</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-heading font-bold">
          <span className="text-primary">{wpm} WPM</span>
          <span className="text-success">{Math.round(accuracy * 100)}% Accuracy</span>
        </div>
      </div>

      {/* Live Race Lanes (TYP-4) */}
      <div className="bg-surface p-4 rounded-card border-2 border-line space-y-3 shadow-lg">
        <span className="text-xs uppercase font-bold text-text-muted flex items-center justify-between">
          <span>Race Track</span>
          <span>Finish 🏁</span>
        </span>

        <div className="space-y-2">
          {players.map((p) => {
            const progress = allProgress[p.user_id]?.progressPct || (p.user_id === userId ? Math.round((input.length / passage.length) * 100) : 0);
            const isPlayerFinished = allProgress[p.user_id]?.isFinished;

            return (
              <div key={p.user_id} className="relative h-10 bg-surface-raised rounded-full border border-line flex items-center px-2 overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary/20 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />

                <div
                  className="relative z-10 flex items-center gap-2 transition-all duration-300"
                  style={{ left: `calc(${Math.min(92, progress)}% - 10px)` }}
                >
                  <Avatar
                    avatarId={p.profile?.avatar_id || 'avatar-01'}
                    name={p.profile?.display_name || 'Player'}
                    size="sm"
                  />
                  {isPlayerFinished && (
                    <span className="text-xs font-bold text-warn">🏁</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Passage Display with Atkinson Hyperlegible Font (TYP-1, TYP-2) */}
      <div className="bg-surface p-6 rounded-card border-2 border-line space-y-4 shadow-xl">
        <div className="font-typing text-xl md:text-2xl leading-relaxed tracking-wide select-none p-2 bg-bg/40 rounded-xl">
          {passage.split('').map((char, index) => {
            let color = 'text-text-muted/60';
            let isUnderlined = false;

            if (index < input.length) {
              if (input[index] === char) {
                color = 'text-success font-semibold';
              } else {
                color = 'text-danger bg-danger/20 font-bold';
                isUnderlined = true;
              }
            }

            const isCaret = index === input.length && !isFinished;

            return (
              <span
                key={index}
                className={`${color} ${isUnderlined ? 'underline decoration-danger decoration-2' : ''} ${
                  isCaret ? 'border-b-4 border-primary animate-pulse' : ''
                }`}
              >
                {char}
              </span>
            );
          })}
        </div>

        {/* Input Guard (TYP-3) */}
        {!isFinished ? (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onPaste={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type the passage above accurately…"
            className="w-full px-4 py-3 rounded-input bg-surface-raised text-text border-2 border-line font-typing text-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <div className="p-4 rounded-xl bg-success/20 border-2 border-success text-center">
            <span className="font-heading font-black text-2xl text-success flex items-center justify-center gap-2">
              <Trophy className="w-6 h-6" /> Finished! {wpm} WPM • {Math.round(accuracy * 100)}% Accuracy
            </span>
          </div>
        )}
      </div>

      {/* Host Controls */}
      {isHost && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleFinish}>
            End Race & View Podium
          </Button>
        </div>
      )}
    </div>
  );
};

