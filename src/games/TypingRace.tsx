import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeTypingScore, computeTypingWPM } from '@/lib/scoring';
import { SEED_TYPING, TypingSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Flag, Clock, AlertTriangle } from 'lucide-react';

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
  timeMs?: number;
}

export const TypingRace: React.FC<TypingRaceProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  const gameState = room.game_state || {};
  const roundNo = Math.max(1, (gameState.round as number) || 1);
  const totalRounds = Math.max(1, (gameState.totalRounds as number) || 3);

  // Content selection with increasing difficulty across rounds (diff 1 -> 2 -> 3)
  const [passages] = useState<TypingSeedItem[]>(() => {
    const diff1 = SEED_TYPING.filter((t) => t.difficulty === 1);
    const diff2 = SEED_TYPING.filter((t) => t.difficulty === 2);
    const diff3 = SEED_TYPING.filter((t) => t.difficulty === 3);

    return [
      diff1[0] || SEED_TYPING[0],
      diff2[0] || SEED_TYPING[1] || SEED_TYPING[0],
      diff3[0] || SEED_TYPING[2] || SEED_TYPING[0],
      diff3[1] || SEED_TYPING[3] || SEED_TYPING[0],
      diff3[2] || SEED_TYPING[4] || SEED_TYPING[0],
    ];
  });

  const currentPassageItem = passages[roundNo - 1] || passages[0];
  const passageText = currentPassageItem.text;

  const phase = room.phase || 'typing';
  const isIntro = phase === 'intro';
  const isTyping = phase === 'typing';
  const isResult = phase === 'result';

  const [input, setInput] = useState('');
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(1);
  const [finishTimeSec, setFinishTimeSec] = useState<number | null>(null);
  const [allProgress, setAllProgress] = useState<{ [uid: string]: PlayerProgress }>({});
  const [firstFinisherUserId, setFirstFinisherUserId] = useState<string | null>(null);
  const [isLastCall, setIsLastCall] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(75);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  const [roundPoints, setRoundPoints] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const raceStartRef = useRef<number>(Date.now());
  const lastBroadcastRef = useRef<number>(0);

  // Reset state on round advance
  useEffect(() => {
    setInput('');
    setTotalKeystrokes(0);
    setCorrectKeystrokes(0);
    setIsFinished(false);
    setWpm(0);
    setAccuracy(1);
    setFinishTimeSec(null);
    setFirstFinisherUserId(null);
    setIsLastCall(false);
    setRoundPoints(0);
    setAllProgress({});
    raceStartRef.current = timeSync.correctedNow();
    if (isTyping) {
      inputRef.current?.focus();
    }
  }, [roundNo]);

  // Synchronized timer and TYP-4 Last Call logic
  useEffect(() => {
    if (!room.phase_ends_at || isIntro) {
      setRemainingSecs(75);
      return;
    }

    const interval = window.setInterval(() => {
      const endsAtMs = new Date(room.phase_ends_at!).getTime();
      let left = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000));

      if (isLastCall) {
        left = Math.min(left, 20);
      }

      setRemainingSecs(left);
      if (left <= 5 && left > 0 && isTyping) {
        sound.playTick();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [room.phase_ends_at, isIntro, isTyping, isLastCall]);

  // Broadcast throttled progress (TYP-5: at most 4 times per second)
  const broadcastProgress = useCallback(
    async (progressPct: number, currentWpm: number, finished: boolean, timeSec?: number) => {
      const now = Date.now();
      if (now - lastBroadcastRef.current < 250 && !finished) return;
      lastBroadcastRef.current = now;

      const payload: PlayerProgress = {
        userId,
        progressPct,
        wpm: currentWpm,
        isFinished: finished,
        timeMs: timeSec ? Math.round(timeSec * 1000) : undefined,
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

  // Realtime subscription for race lanes and first finisher last-call
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

        // TYP-4: Trigger last call when the first player finishes
        if (payload.isFinished && !firstFinisherUserId) {
          setFirstFinisherUserId(payload.userId);
          setIsLastCall(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, firstFinisherUserId]);

  // Handle keystroke input with TYP-2 & TYP-3 anti-cheat
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isFinished || !isTyping) return;

    const val = e.target.value;
    if (val.length > passageText.length) return;

    setTotalKeystrokes((prev) => prev + 1);

    const charIndex = val.length - 1;
    if (charIndex >= 0 && val[charIndex] === passageText[charIndex]) {
      setCorrectKeystrokes((prev) => prev + 1);
    }

    setInput(val);

    // Strict sequential matching
    let correctCount = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === passageText[i]) correctCount++;
      else break;
    }

    const elapsedSeconds = Math.max(0.5, (timeSync.correctedNow() - raceStartRef.current) / 1000);
    const currentWpm = computeTypingWPM(correctCount, elapsedSeconds);
    const progressPct = Math.round((correctCount / passageText.length) * 100);

    const currentAccuracy = totalKeystrokes > 0 ? (correctKeystrokes + 1) / (totalKeystrokes + 1) : 1;
    setWpm(currentWpm);
    setAccuracy(currentAccuracy);

    // TYP-2 Finish Condition: exact match of entire passage
    if (val === passageText) {
      setIsFinished(true);
      setFinishTimeSec(elapsedSeconds);
      sound.playFanfare();
      broadcastProgress(100, currentWpm, true, elapsedSeconds);

      // Call authoritative server RPC (TYP-6)
      void (async () => {
        try {
          await supabase.rpc('submit_typing_result', {
            p_room_id: room.id,
            p_round_no: roundNo,
            p_payload: {
              chars_typed: val.length,
              wpm: currentWpm,
              accuracy: currentAccuracy,
              finished: true,
              elapsed_s: elapsedSeconds,
            },
          });
        } catch {
          // ignore
        }
      })();
    } else {
      broadcastProgress(progressPct, currentWpm, false);
    }
  };

  // TYP-3: Block paste, drag, drop
  const handlePreventAction = (e: React.SyntheticEvent) => {
    e.preventDefault();
  };

  // Evaluate Round Result on Result Phase
  useEffect(() => {
    if (!isResult) return;

    // Rank finished players by WPM descending
    const finishers = Object.values(allProgress)
      .filter((p) => p.isFinished)
      .sort((a, b) => (b.wpm || 0) - (a.wpm || 0));

    const rankIndex = finishers.findIndex((p) => p.userId === userId);
    const myRank = rankIndex !== -1 ? rankIndex + 1 : 5;

    let pts = computeTypingScore(myRank, isFinished, Math.round((input.length / passageText.length) * 100), accuracy);
    if (roundNo >= 3) {
      pts = Math.round(pts * 1.2); // Round 3+ worth x1.2
    }

    setRoundPoints(pts);

    setCumulativeScores((prev) => {
      const updated = { ...prev, [userId]: (prev[userId] || 0) + pts };
      if (roundNo >= totalRounds) {
        onFinishGame(updated);
      }
      return updated;
    });
  }, [isResult]);

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6 select-none animate-fade">
      {/* Header Banner */}
      <div className="w-full flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-typing text-ink flex items-center justify-center font-bold shadow-sm">
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Round {roundNo} of {totalRounds} • {currentPassageItem.category}
              {roundNo >= 3 && (
                <span className="px-2 py-0.5 rounded-[6px] bg-warn text-ink text-[11px] font-black uppercase tracking-wider">
                  ⚡ 1.2x Multiplier
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted capitalize">
              Difficulty Tier {currentPassageItem.difficulty}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-heading font-black">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line shadow-tile-sm">
            <span className="text-primary tabular-nums">{wpm} WPM</span>
            <span className="text-line">•</span>
            <span className="text-success tabular-nums">{Math.round(accuracy * 100)}% Acc</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line text-xs font-heading font-black shadow-tile-sm">
            <Clock className="w-3.5 h-3.5 text-warn" />
            <span className={`tabular-nums ${remainingSecs <= 10 ? 'text-danger animate-pulse font-black' : 'text-text'}`}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* TYP-4: Last Call Notification */}
      {isLastCall && !isFinished && (
        <div className="p-3 rounded-[12px] bg-warn/15 border-2 border-warn text-warn text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 animate-bounce">
          <AlertTriangle className="w-4 h-4" />
          <span>Last Call! A player has crossed the finish line — 20 seconds remaining!</span>
        </div>
      )}

      {/* TYP-5: Live Race Lanes */}
      <div className="tile p-4 space-y-2.5">
        <span className="text-xs font-black uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>Race Track</span>
          <span>Finish 🏁</span>
        </span>

        <div className="space-y-2">
          {players.map((p) => {
            const prog = allProgress[p.user_id]?.progressPct || (p.user_id === userId ? Math.round((input.length / passageText.length) * 100) : 0);
            const isFin = allProgress[p.user_id]?.isFinished;
            const isMe = p.user_id === userId;

            return (
              <div
                key={p.user_id}
                className="relative h-11 bg-surface-raised rounded-[12px] border-2 border-line flex items-center px-2 overflow-hidden shadow-sm"
              >
                {/* Progress bar fill */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-game-typing/20 transition-all duration-200 border-r-2 border-game-typing"
                  style={{ width: `${Math.max(4, Math.min(100, prog))}%` }}
                />

                <div className="relative z-10 flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Avatar avatarId={p.profile?.avatar_id || 'avatar-01'} name={p.profile?.display_name} size="sm" />
                    <span className="font-heading font-bold text-xs text-text truncate max-w-[120px]">
                      {p.profile?.display_name || 'Player'} {isMe && '(You)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-black">
                    <span className="text-primary tabular-nums">
                      {allProgress[p.user_id]?.wpm || (isMe ? wpm : 0)} WPM
                    </span>
                    {isFin && (
                      <span className="px-1.5 py-0.5 rounded bg-success text-ink font-black text-[10px]">
                        Finished 🏁
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Typing Area (Atkinson Hyperlegible, 22px+, line-height 1.8) */}
      <div
        className="tile p-6 md:p-8 relative min-h-[160px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {isIntro ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-primary">Get Ready</span>
            <p className="text-lg font-heading font-bold text-text-muted blur-sm select-none">
              The race passage will reveal the instant the countdown expires...
            </p>
          </div>
        ) : (
          <>
            <div className="font-typing text-xl md:text-2xl leading-[1.8] tracking-wide select-none">
              {passageText.split('').map((char, idx) => {
                const typedChar = input[idx];
                const isTyped = idx < input.length;
                const isCurrent = idx === input.length;
                const isMatch = typedChar === char;

                let charStyle = 'text-text-muted/60';
                if (isTyped) {
                  charStyle = isMatch ? 'text-success font-bold' : 'text-danger underline font-bold bg-danger/10';
                }

                return (
                  <span
                    key={idx}
                    className={`${charStyle} ${isCurrent ? 'bg-primary/30 border-b-2 border-primary animate-pulse' : ''}`}
                  >
                    {char}
                  </span>
                );
              })}
            </div>

            {/* Hidden Input capturing typing events with TYP-3 anti-cheat */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onPaste={handlePreventAction}
              onDrop={handlePreventAction}
              onDragOver={handlePreventAction}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isFinished || !isTyping}
              className="absolute inset-0 opacity-0 cursor-default"
              autoFocus
            />

            {isFinished && (
              <div className="mt-4 p-3 rounded-[12px] bg-success/20 border-2 border-success text-success text-center font-heading font-black text-sm animate-fade">
                🎉 Finished! Completed in {finishTimeSec?.toFixed(1)}s with {wpm} WPM and {Math.round(accuracy * 100)}% accuracy!
              </div>
            )}
          </>
        )}
      </div>

      {/* Result Phase Score Card */}
      {isResult && (
        <div className="tile p-4 bg-surface-raised space-y-2 animate-fade">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-success font-heading font-black">
              +{roundPoints} Round Points Awarded!
            </span>
            <span className="text-text-muted text-xs">
              Cumulative: {cumulativeScores[userId] || 0} pts
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
