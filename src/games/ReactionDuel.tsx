import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { sound } from '@/lib/sound';
import { computeReactionRoundScore } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Zap, AlertTriangle, Crosshair, Clock } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface ReactionDuelProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

interface TapResult {
  userId: string;
  timeMs: number | null;
  isFalseStart: boolean;
  score: number;
}

export const ReactionDuel: React.FC<ReactionDuelProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  const gameState = room.game_state || {};
  const roundNo = Math.max(1, (gameState.round as number) || 1);
  const totalRounds = Math.max(5, (gameState.totalRounds as number) || 7);

  // Round Types Sequence (Classic, Classic, Decoy, Target, Classic, Decoy, Target)
  const getRoundType = (r: number): 'classic' | 'decoy' | 'target' => {
    if (r === 1 || r === 2) return 'classic';
    const pattern = ['decoy', 'target', 'classic'] as const;
    return pattern[(r - 3) % 3];
  };

  const roundType = getRoundType(roundNo);
  const isTargetRound = roundType === 'target';
  const isDecoyRound = roundType === 'decoy';

  const phase = room.phase || 'wait';
  const isIntro = phase === 'intro';
  const isWait = phase === 'wait';
  const isGo = phase === 'go';
  const isResult = phase === 'result';

  const [hasTapped, setHasTapped] = useState(false);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [isFalseStart, setIsFalseStart] = useState(false);
  const [roundTaps, setRoundTaps] = useState<TapResult[]>([]);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  void cumulativeScores;
  const [decoyColor, setDecoyColor] = useState<string | null>(null);
  const [targetPos, setTargetPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [shakeTarget, setShakeTarget] = useState(false);

  const goPaintedTimeRef = useRef<number>(0);
  const directorTimerRef = useRef<number | null>(null);

  // Director determination: host or earliest-joined connected player
  const isDirector = isHost || (players.length > 0 && players[0].user_id === userId);

  // Reset round state
  useEffect(() => {
    setHasTapped(false);
    setReactionTime(null);
    setIsFalseStart(false);
    setDecoyColor(null);
    setRoundTaps([]);
    setShakeTarget(false);

    // Seed target position for Target rounds
    if (isTargetRound) {
      const rx = Math.floor(Math.random() * 60) + 20; // 20% to 80%
      const ry = Math.floor(Math.random() * 50) + 25;
      setTargetPos({ x: rx, y: ry });
    }
  }, [roundNo, roundType, isTargetRound]);

  // REA-1: Director calls signal_go after secret delay
  useEffect(() => {
    if (!isDirector || !isWait) return;

    // Random delay between 2.0s and 6.5s
    const delayMs = Math.floor(Math.random() * 4500) + 2000;
    if (directorTimerRef.current) clearTimeout(directorTimerRef.current);

    directorTimerRef.current = window.setTimeout(async () => {
      try {
        await supabase.rpc('signal_go', {
          p_room_id: room.id,
          p_round_no: roundNo,
        });
      } catch {
        // Handled by 9.5s void rule
      }
    }, delayMs);

    return () => {
      if (directorTimerRef.current) clearTimeout(directorTimerRef.current);
    };
  }, [isDirector, isWait, room.id, roundNo]);

  // Decoy color flasher for Decoy rounds during 'wait'
  useEffect(() => {
    if (!isWait || !isDecoyRound) {
      setDecoyColor(null);
      return;
    }

    const decoyColors = ['#4F7CFF', '#FF8FB8', '#8F6BFF']; // blue, pink, purple
    const flashInterval = window.setInterval(() => {
      // 40% chance of random decoy flash every 700ms
      if (Math.random() > 0.6) {
        const picked = decoyColors[Math.floor(Math.random() * decoyColors.length)];
        setDecoyColor(picked);
        window.setTimeout(() => setDecoyColor(null), 300);
      }
    }, 700);

    return () => clearInterval(flashInterval);
  }, [isWait, isDecoyRound]);

  // REA-2: Hardware paint timestamping via requestAnimationFrame when 'go' arrives
  useEffect(() => {
    if (!isGo) return;

    requestAnimationFrame(() => {
      goPaintedTimeRef.current = performance.now();
      sound.playGo();
    });
  }, [isGo]);

  // Handle Tap Action
  const handleTap = useCallback(async () => {
    if (hasTapped || isResult) return;

    // REA-3: False start during 'wait' or decoy flash
    if (isWait) {
      setHasTapped(true);
      setIsFalseStart(true);
      sound.playWrong();

      const tapData: TapResult = {
        userId,
        timeMs: null,
        isFalseStart: true,
        score: 0,
      };

      setRoundTaps((prev) => [...prev, tapData]);

      // Call authoritative RPC
      void (async () => {
        try {
          await supabase.rpc('submit_reaction', {
            p_room_id: room.id,
            p_round_no: roundNo,
            p_ms: 0,
            p_kind: 'false_start',
          });
        } catch {
          // ignore
        }
      })();

      // Broadcast tap to peers
      const channel = supabase.channel(`reaction:${room.id}`);
      channel.send({
        type: 'broadcast',
        event: 'player_tapped',
        payload: tapData,
      });
      return;
    }

    // REA-2 & REA-4: Valid reaction tap during 'go'
    if (isGo) {
      const now = performance.now();
      const elapsed = Math.round(now - goPaintedTimeRef.current);

      setHasTapped(true);
      const isTooEarly = elapsed < 80;

      if (isTooEarly) {
        setIsFalseStart(true);
        sound.playWrong();
      } else {
        setReactionTime(elapsed);
        sound.playCorrect();
      }

      const tapData: TapResult = {
        userId,
        timeMs: isTooEarly ? null : elapsed,
        isFalseStart: isTooEarly,
        score: 0,
      };

      setRoundTaps((prev) => [...prev, tapData]);

      // Call authoritative RPC
      void (async () => {
        try {
          await supabase.rpc('submit_reaction', {
            p_room_id: room.id,
            p_round_no: roundNo,
            p_ms: elapsed,
            p_kind: isTooEarly ? 'false_start' : 'tap',
          });
        } catch {
          // ignore
        }
      })();

      const channel = supabase.channel(`reaction:${room.id}`);
      channel.send({
        type: 'broadcast',
        event: 'player_tapped',
        payload: tapData,
      });
    }
  }, [hasTapped, isWait, isGo, isResult, userId, room.id, roundNo]);

  // Target Round Click Handler (tap inside target circle)
  const handleTargetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTap();
  };

  const handleMissedTarget = () => {
    if (!isGo || !isTargetRound || hasTapped) return;
    setShakeTarget(true);
    sound.playTick();
    setTimeout(() => setShakeTarget(false), 250);
  };

  // Realtime subscription for peer taps
  useEffect(() => {
    const channel = supabase.channel(`reaction:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'player_tapped' }, ({ payload }) => {
        setRoundTaps((prev) => {
          if (prev.some((t) => t.userId === payload.userId)) return prev;
          return [...prev, payload];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id]);

  // Evaluate Round Scores on Result Phase
  useEffect(() => {
    if (!isResult) return;

    // Filter valid taps and rank fastest first
    const validTaps = roundTaps
      .filter((t) => !t.isFalseStart && t.timeMs !== null)
      .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));

    const myRankIdx = validTaps.findIndex((t) => t.userId === userId);
    let pts = 0;
    if (myRankIdx !== -1 && !isFalseStart && reactionTime) {
      pts = computeReactionRoundScore(myRankIdx + 1, false, reactionTime);
      if (isTargetRound) {
        pts = Math.round(pts * 1.25); // Target rounds worth x1.25
      }
    }

    setCumulativeScores((prev) => {
      const updated = { ...prev, [userId]: (prev[userId] || 0) + pts };
      if (roundNo >= totalRounds) {
        onFinishGame(updated);
      }
      return updated;
    });
  }, [isResult]);

  // Keyboard space / enter tap support (REA-7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isTargetRound) {
          handleTap();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTap, isTargetRound]);

  // Background color selection
  let screenBg = 'bg-surface';
  if (isWait) {
    screenBg = decoyColor ? '' : 'bg-game-wait';
  } else if (isGo) {
    screenBg = 'bg-game-go';
  }

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6 select-none animate-fade">
      {/* Header Banner */}
      <div className="w-full flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-reaction text-ink flex items-center justify-center font-bold shadow-sm">
            <Zap className="w-5 h-5 fill-ink" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Round {roundNo} of {totalRounds} •{' '}
              <span className="capitalize">{roundType} Mode</span>
              {isTargetRound && (
                <span className="px-2 py-0.5 rounded-[6px] bg-warn text-ink text-[11px] font-black uppercase tracking-wider">
                  🎯 1.25x Multiplier
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {roundType === 'classic' && 'Tap as fast as you can when screen turns green'}
              {roundType === 'decoy' && 'Watch out for decoy color flashes! Tap ONLY on green'}
              {roundType === 'target' && 'Tap directly inside the target circle when green'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-heading font-black px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line shadow-tile-sm">
          <Clock className="w-3.5 h-3.5 text-warn" />
          <span>{phase.toUpperCase()}</span>
        </div>
      </div>

      {/* Main Duel Surface */}
      <div
        onClick={isTargetRound ? handleMissedTarget : handleTap}
        style={{ backgroundColor: decoyColor || undefined }}
        className={`w-full min-h-[380px] md:min-h-[440px] rounded-card border-2 border-line flex flex-col items-center justify-center p-6 relative transition-colors duration-75 cursor-pointer shadow-tile-lg ${screenBg}`}
      >
        {isIntro && (
          <div className="text-center space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-primary">Get Ready</span>
            <h2 className="text-3xl md:text-5xl font-black font-heading text-text capitalize">
              {roundType} Round
            </h2>
            <p className="text-sm font-heading font-bold text-text-muted max-w-md">
              {roundType === 'classic' && 'Screen will turn bright green. Tap anywhere!'}
              {roundType === 'decoy' && 'Do not tap on blue, pink, or purple. Green is the only signal.'}
              {roundType === 'target' && 'Find the round target and tap inside!'}
            </p>
          </div>
        )}

        {isWait && (
          <div className="text-center space-y-3 pointer-events-none">
            <h2 className="text-3xl md:text-5xl font-black font-heading text-ink">
              {decoyColor ? 'STAY BACK!' : 'Wait for green…'}
            </h2>
            <p className="text-sm font-heading font-bold text-ink/75">
              {isFalseStart ? '⚠️ False start! Locked out this round' : 'Tap anywhere or press Space'}
            </p>
          </div>
        )}

        {isGo && !isTargetRound && (
          <div className="text-center space-y-2 pointer-events-none animate-ping-once">
            <h2 className="text-5xl md:text-7xl font-black font-heading text-ink tracking-tight">
              TAP NOW!
            </h2>
            <p className="text-lg font-black font-heading text-ink/80">GO GO GO!</p>
          </div>
        )}

        {/* Target Round Target Circle */}
        {isGo && isTargetRound && (
          <div
            onClick={handleTargetClick}
            style={{ left: `${targetPos.x}%`, top: `${targetPos.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-primary border-4 border-ink flex items-center justify-center cursor-pointer shadow-tile active:scale-95 transition-transform ${
              shakeTarget ? 'animate-shake' : ''
            }`}
          >
            <Crosshair className="w-12 h-12 text-ink animate-spin-slow" />
          </div>
        )}

        {isResult && (
          <div className="text-center space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-primary">Round Results</span>
            <h3 className="text-3xl md:text-4xl font-black font-heading text-text">
              {isFalseStart ? (
                <span className="text-danger flex items-center justify-center gap-2">
                  <AlertTriangle className="w-8 h-8" /> False Start (+0 pts)
                </span>
              ) : reactionTime ? (
                <span className="text-success flex items-center justify-center gap-2">
                  ⚡ {reactionTime} ms!
                </span>
              ) : (
                <span className="text-text-muted">No Tap (+0 pts)</span>
              )}
            </h3>
          </div>
        )}
      </div>

      {/* Round Result Ranks List */}
      {isResult && roundTaps.length > 0 && (
        <div className="tile p-4 space-y-2.5 bg-surface-raised animate-fade">
          <span className="text-xs font-black uppercase tracking-wider text-text-muted">
            Round {roundNo} Standings
          </span>
          <div className="space-y-1.5">
            {roundTaps
              .sort((a, b) => (a.timeMs || 99999) - (b.timeMs || 99999))
              .map((t, idx) => {
                const player = players.find((p) => p.user_id === t.userId);
                return (
                  <div
                    key={t.userId}
                    className="flex items-center justify-between p-2 rounded-[10px] bg-surface border border-line text-xs font-bold font-heading"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-text-muted">#{idx + 1}</span>
                      <Avatar avatarId={player?.profile?.avatar_id || 'avatar-01'} name={player?.profile?.display_name} size="sm" />
                      <span className="text-text">{player?.profile?.display_name || 'Player'}</span>
                    </div>

                    <span className={t.isFalseStart ? 'text-danger' : 'text-primary font-black tabular-nums'}>
                      {t.isFalseStart ? 'Too early' : `${t.timeMs} ms`}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
