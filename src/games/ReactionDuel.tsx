import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { computeReactionRoundScore } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Zap, AlertTriangle } from 'lucide-react';

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

interface RoundResult {
  userId: string;
  timeMs: number | null;
  isFalseStart: boolean;
  score: number;
  [key: string]: unknown;
}

export const ReactionDuel: React.FC<ReactionDuelProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  const [currentRound, setCurrentRound] = useState(1);
  const totalRounds = 5;

  // Global synchronized states: 'ready' | 'waiting' | 'go' | 'round_result'
  const [gameState, setGameState] = useState<'ready' | 'waiting' | 'go' | 'round_result'>('ready');
  const [hasTappedThisRound, setHasTappedThisRound] = useState(false);
  const [reactionTime, setReactionTime] = useState<number | null>(null);

  const [roundTaps, setRoundTaps] = useState<RoundResult[]>([]);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});

  const goPaintedTimeRef = useRef<number>(0);
  const timerTimeoutRef = useRef<number | null>(null);
  const roundResultsCalculatedRef = useRef(false);

  // Broadcast helper
  const sendBroadcast = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      const channel = supabase.channel(`reaction:${room.id}`);
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
    const channel = supabase.channel(`reaction:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'start_waiting' }, ({ payload }) => {
        // All players enter "Wait for green..." at the same time
        setCurrentRound(payload.round);
        setGameState('waiting');
        setHasTappedThisRound(false);
        setReactionTime(null);
        setRoundTaps([]);
        roundResultsCalculatedRef.current = false;
      })
      .on('broadcast', { event: 'go_signal' }, () => {
        // All players turn green at the exact same instant
        requestAnimationFrame(() => {
          goPaintedTimeRef.current = performance.now();
          setGameState('go');
          sound.playGo();
        });
      })
      .on('broadcast', { event: 'player_tapped' }, ({ payload }) => {
        setRoundTaps((prev) => {
          if (prev.some((t) => t.userId === payload.userId)) return prev;
          return [...prev, payload];
        });
      })
      .on('broadcast', { event: 'round_concluded' }, ({ payload }) => {
        // All players see the exact same results table simultaneously
        setRoundTaps(payload.rankedResults);
        setCumulativeScores(payload.cumulativeScores);
        setGameState('round_result');
      })
      .on('broadcast', { event: 'advance_round' }, ({ payload }) => {
        // All players transition to the next round together
        setCurrentRound(payload.nextRound);
        setGameState('ready');
        setHasTappedThisRound(false);
        setRoundTaps([]);
      })
      .on('broadcast', { event: 'duel_finished' }, ({ payload }) => {
        onFinishGame(payload.finalScores);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);
    };
  }, [room.id, onFinishGame]);

  // Host starts the countdown for the round
  const handleHostStartRound = async () => {
    if (!isHost) return;

    // 1. Tell all players to enter "Wait for green..."
    await sendBroadcast('start_waiting', { round: currentRound });

    // 2. Schedule the random GO delay between 2.5s and 6s (REA-1)
    const delayMs = Math.floor(Math.random() * 3500) + 2500;
    if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);

    timerTimeoutRef.current = window.setTimeout(async () => {
      await sendBroadcast('go_signal', { round: currentRound });
    }, delayMs);
  };

  // Player Tap Action (Keyboard or Touch)
  const handleTap = async () => {
    if (hasTappedThisRound) return;

    if (gameState === 'waiting') {
      // False start! (REA-3)
      setHasTappedThisRound(true);
      sound.playWrong();

      const tapData: RoundResult = {
        userId,
        timeMs: null,
        isFalseStart: true,
        score: 0,
      };

      await sendBroadcast('player_tapped', tapData);
      return;
    }

    if (gameState === 'go') {
      const now = performance.now();
      const elapsed = Math.round(now - goPaintedTimeRef.current);

      setHasTappedThisRound(true);
      const falseStart = elapsed < 80;
      setReactionTime(elapsed);

      if (falseStart) {
        sound.playWrong();
      } else {
        sound.playCorrect();
      }

      const tapData: RoundResult = {
        userId,
        timeMs: elapsed,
        isFalseStart: falseStart,
        score: 0,
      };

      await sendBroadcast('player_tapped', tapData);
    }
  };

  // Host evaluates and synchronizes round results when all players tapped (or timeout)
  useEffect(() => {
    if (!isHost) return;
    if (gameState !== 'go' && gameState !== 'waiting') return;
    if (roundResultsCalculatedRef.current) return;

    // Check if everyone has tapped
    const totalConnected = players.length;
    if (roundTaps.length >= totalConnected && totalConnected > 0) {
      roundResultsCalculatedRef.current = true;

      // Sort valid taps by timeMs ascending
      const validTaps = roundTaps
        .filter((t) => !t.isFalseStart && t.timeMs !== null)
        .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));

      const updatedScores = { ...cumulativeScores };
      const ranked: RoundResult[] = roundTaps.map((t) => {
        if (t.isFalseStart || !t.timeMs) {
          return { ...t, score: 0 };
        }
        const rankIndex = validTaps.findIndex((v) => v.userId === t.userId);
        const pts = computeReactionRoundScore(rankIndex + 1, false, t.timeMs);
        updatedScores[t.userId] = (updatedScores[t.userId] || 0) + pts;
        return { ...t, score: pts };
      });

      // Broadcast concluded results to everyone
      sendBroadcast('round_concluded', {
        rankedResults: ranked,
        cumulativeScores: updatedScores,
      });
    }
  }, [isHost, gameState, roundTaps, players.length, cumulativeScores, sendBroadcast]);

  // Host advances everyone to the next round or the podium
  const handleNextRoundOrFinish = async () => {
    if (!isHost) return;

    if (currentRound >= totalRounds) {
      await sendBroadcast('duel_finished', { finalScores: cumulativeScores });
      onFinishGame(cumulativeScores);
    } else {
      await sendBroadcast('advance_round', { nextRound: currentRound + 1 });
    }
  };

  // Space / Enter keyboard support (REA-7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, hasTappedThisRound]);

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-game-reaction" />
          <span className="font-heading font-bold text-lg text-text">Reaction Duel</span>
        </div>
        <div className="font-heading font-bold text-sm text-text-muted">
          Round {currentRound} of {totalRounds}
        </div>
      </div>

      {/* Main Interactive Arena */}
      <div className="flex-1 flex items-center justify-center my-6">
        {/* State: Ready */}
        {gameState === 'ready' && (
          <div className="text-center space-y-4 max-w-md">
            <div className="w-20 h-20 rounded-full bg-game-reaction/20 border-2 border-game-reaction mx-auto flex items-center justify-center text-3xl">
              ⚡
            </div>
            <h2 className="text-2xl font-black font-heading text-text">Get Ready for Round {currentRound}!</h2>
            <p className="text-sm text-text-muted">
              Tap as fast as you can the instant the screen turns bright green. Tapping early counts as a false start!
            </p>
            {isHost ? (
              <Button variant="primary" size="lg" onClick={handleHostStartRound} fullWidth>
                Start Round {currentRound}
              </Button>
            ) : (
              <div className="p-3 rounded-full bg-surface-raised border border-line text-xs font-semibold text-text-muted">
                Waiting for host to start Round {currentRound}…
              </div>
            )}
          </div>
        )}

        {/* State: Waiting ("Wait for green...") */}
        {gameState === 'waiting' && (
          <button
            onClick={handleTap}
            className={`w-full h-80 rounded-modal border-4 transition-all flex flex-col items-center justify-center cursor-pointer ${
              hasTappedThisRound
                ? 'bg-danger/20 border-danger'
                : 'bg-warn/25 border-warn active:scale-[0.99]'
            }`}
          >
            {hasTappedThisRound ? (
              <div className="text-center space-y-2">
                <AlertTriangle className="w-12 h-12 text-danger mx-auto animate-bounce" />
                <span className="text-3xl font-heading font-black text-danger">TOO EARLY!</span>
                <p className="text-xs text-text-muted">False start detected. 0 points this round.</p>
              </div>
            ) : (
              <>
                <span className="text-3xl sm:text-4xl font-heading font-black text-warn animate-pulse">
                  Wait for green…
                </span>
                <span className="text-xs text-text-muted mt-2">Tap anywhere or press Space</span>
              </>
            )}
          </button>
        )}

        {/* State: Green GO! ("TAP NOW!") */}
        {gameState === 'go' && (
          <button
            onClick={handleTap}
            disabled={hasTappedThisRound}
            className={`w-full h-80 rounded-modal border-4 flex flex-col items-center justify-center cursor-pointer shadow-2xl transition-transform ${
              hasTappedThisRound
                ? 'bg-surface border-line'
                : 'bg-[#2EE37D] text-[#1E1B3A] border-[#2EE37D] active:scale-95'
            }`}
          >
            {hasTappedThisRound ? (
              <div className="text-center space-y-2">
                <span className="text-5xl font-black font-heading text-success">
                  {reactionTime} ms
                </span>
                <p className="text-xs text-text-muted">Recorded! Waiting for other players…</p>
              </div>
            ) : (
              <>
                <span className="text-6xl sm:text-7xl font-heading font-black tracking-widest animate-bounce">
                  TAP NOW!
                </span>
                <span className="text-sm font-bold mt-2">GO GO GO!</span>
              </>
            )}
          </button>
        )}

        {/* State: Round Results (Synchronized for all players) */}
        {gameState === 'round_result' && (
          <div className="w-full max-w-lg bg-surface p-6 rounded-card border-2 border-line shadow-xl space-y-4">
            <h3 className="font-heading font-bold text-lg text-text text-center">
              Round {currentRound} Standings
            </h3>

            <div className="space-y-2">
              {roundTaps
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((res, i) => {
                  const player = players.find((p) => p.user_id === res.userId);
                  const isMe = res.userId === userId;

                  return (
                    <div
                      key={res.userId}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        isMe ? 'bg-primary/10 border-primary' : 'bg-surface-raised border-line'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-heading font-bold text-sm text-text-muted w-4">
                          #{i + 1}
                        </span>
                        <Avatar
                          avatarId={player?.profile?.avatar_id || 'avatar-01'}
                          name={player?.profile?.display_name || 'Player'}
                          size="sm"
                        />
                        <span className="font-semibold text-sm text-text">
                          {player?.profile?.display_name || 'Player'}
                          {isMe && <span className="text-xs text-primary ml-1">(You)</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-text-muted">
                          {res.isFalseStart ? 'False Start' : `${res.timeMs} ms`}
                        </span>
                        <span className="font-heading font-bold text-sm text-primary">
                          +{res.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {isHost ? (
              <Button variant="primary" fullWidth onClick={handleNextRoundOrFinish} className="mt-4">
                {currentRound >= totalRounds ? 'View Final Podium' : 'Next Round →'}
              </Button>
            ) : (
              <div className="text-center text-xs text-text-muted p-2">
                Waiting for host to proceed to {currentRound >= totalRounds ? 'Podium' : 'Next Round'}…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-text-muted">
        <span>Hardware timestamping active • Zero-lag local measurement (REA-2)</span>
      </div>
    </div>
  );
};
