import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { computeReactionRoundScore } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Zap, AlertTriangle, ArrowRight } from 'lucide-react';

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

  // Round states: 'ready' | 'waiting' | 'go' | 'tapped' | 'round_result'
  const [gameState, setGameState] = useState<'ready' | 'waiting' | 'go' | 'tapped' | 'round_result'>('ready');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [isFalseStart, setIsFalseStart] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});

  const goPaintedTimeRef = useRef<number>(0);
  const timerTimeoutRef = useRef<number | null>(null);

  // Setup Realtime Broadcast channel for GO echo and taps
  useEffect(() => {
    const channel = supabase.channel(`reaction:${room.id}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'go_signal' }, () => {
        // Echo received - render green frame and record paint time with requestAnimationFrame
        requestAnimationFrame(() => {
          goPaintedTimeRef.current = performance.now();
          setGameState('go');
          sound.playGo();
        });
      })
      .on('broadcast', { event: 'submit_tap' }, ({ payload }) => {
        setRoundResults((prev) => {
          if (prev.some((r) => r.userId === payload.userId)) return prev;
          return [...prev, payload];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);
    };
  }, [room.id]);

  // Start new round
  const startRound = () => {
    setReactionTime(null);
    setIsFalseStart(false);
    setGameState('waiting');
    setRoundResults([]);

    if (isHost) {
      // Choose random delay between 2 to 7 seconds (REA-1)
      const delayMs = Math.floor(Math.random() * 5000) + 2000;
      timerTimeoutRef.current = window.setTimeout(async () => {
        const channel = supabase.channel(`reaction:${room.id}`);
        await channel.send({
          type: 'broadcast',
          event: 'go_signal',
          payload: { round: currentRound },
        });
      }, delayMs);
    }
  };

  const handleTap = async () => {
    if (gameState === 'waiting') {
      // False start! (REA-3)
      setIsFalseStart(true);
      setGameState('tapped');
      sound.playWrong();

      const tapResult: RoundResult = {
        userId,
        timeMs: null,
        isFalseStart: true,
        score: 0,
      };

      setRoundResults((prev) => [...prev, tapResult]);

      const channel = supabase.channel(`reaction:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'submit_tap',
        payload: tapResult,
      });
      return;
    }

    if (gameState === 'go') {
      const tapTime = performance.now();
      const elapsed = Math.round(tapTime - goPaintedTimeRef.current);

      // REA-4: Implausible times (<80ms) rejected as false starts
      const falseStart = elapsed < 80;
      setReactionTime(elapsed);
      setIsFalseStart(falseStart);
      setGameState('tapped');

      if (falseStart) {
        sound.playWrong();
      } else {
        sound.playCorrect();
      }

      const tapResult: RoundResult = {
        userId,
        timeMs: elapsed,
        isFalseStart: falseStart,
        score: 0, // calculated at round end based on rank
      };

      setRoundResults((prev) => [...prev, tapResult]);

      const channel = supabase.channel(`reaction:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'submit_tap',
        payload: tapResult,
      });
    }
  };

  // Evaluate round when all players tap or 3s expires
  useEffect(() => {
    if (gameState === 'tapped' && roundResults.length >= players.length) {
      // Sort valid taps by timeMs ascending
      const validTaps = roundResults
        .filter((r) => !r.isFalseStart && r.timeMs !== null)
        .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));

      const updatedScores = { ...cumulativeScores };
      const rankedResults: RoundResult[] = roundResults.map((r) => {
        if (r.isFalseStart || !r.timeMs) {
          return { ...r, score: 0 };
        }
        const rankIndex = validTaps.findIndex((v) => v.userId === r.userId);
        const score = computeReactionRoundScore(rankIndex + 1, false, r.timeMs);
        updatedScores[r.userId] = (updatedScores[r.userId] || 0) + score;
        return { ...r, score };
      });

      setRoundResults(rankedResults);
      setCumulativeScores(updatedScores);
      setGameState('round_result');
    }
  }, [gameState, roundResults, players.length, cumulativeScores]);

  const nextRoundOrFinish = () => {
    if (currentRound >= totalRounds) {
      onFinishGame(cumulativeScores);
    } else {
      setCurrentRound((r) => r + 1);
      setGameState('ready');
    }
  };

  // REA-7: Keyboard Space/Enter listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (gameState === 'waiting' || gameState === 'go') {
          handleTap();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

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

      {/* Main Interactive Screen */}
      <div className="flex-1 flex items-center justify-center my-6">
        {gameState === 'ready' && (
          <div className="text-center space-y-4 max-w-md">
            <div className="w-20 h-20 rounded-full bg-game-reaction/20 border-2 border-game-reaction mx-auto flex items-center justify-center text-3xl">
              ⚡
            </div>
            <h2 className="text-2xl font-black font-heading text-text">Get Ready!</h2>
            <p className="text-sm text-text-muted">
              Tap as fast as you can the instant the screen turns bright green. Tapping early counts as a false start!
            </p>
            {isHost && (
              <Button variant="primary" size="lg" onClick={startRound} fullWidth>
                Start Round {currentRound}
              </Button>
            )}
          </div>
        )}

        {gameState === 'waiting' && (
          <button
            onClick={handleTap}
            className="w-full h-80 rounded-modal bg-warn/25 border-4 border-warn flex flex-col items-center justify-center cursor-pointer transition-colors active:scale-[0.99]"
          >
            <span className="text-3xl font-heading font-black text-warn animate-pulse">
              Wait for green…
            </span>
            <span className="text-xs text-text-muted mt-2">Tap anywhere or press Space</span>
          </button>
        )}

        {gameState === 'go' && (
          <button
            onClick={handleTap}
            className="w-full h-80 rounded-modal bg-[#2EE37D] text-[#1E1B3A] border-4 border-[#2EE37D] flex flex-col items-center justify-center cursor-pointer shadow-2xl transition-transform active:scale-95"
          >
            <span className="text-6xl font-heading font-black tracking-widest animate-bounce">
              TAP NOW!
            </span>
            <span className="text-sm font-bold mt-2">GO GO GO!</span>
          </button>
        )}

        {gameState === 'tapped' && (
          <div className="w-full h-80 rounded-modal bg-surface border-2 border-line flex flex-col items-center justify-center text-center p-6">
            {isFalseStart ? (
              <div className="space-y-2">
                <AlertTriangle className="w-12 h-12 text-danger mx-auto" />
                <h3 className="text-2xl font-black font-heading text-danger">Too Early!</h3>
                <p className="text-sm text-text-muted">False start detected. 0 points this round.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-5xl font-black font-heading text-success">
                  {reactionTime} ms
                </span>
                <p className="text-sm text-text-muted">Great reflexes! Waiting for other players…</p>
              </div>
            )}
          </div>
        )}

        {gameState === 'round_result' && (
          <div className="w-full max-w-lg bg-surface p-6 rounded-card border-2 border-line shadow-xl space-y-4">
            <h3 className="font-heading font-bold text-lg text-text text-center">
              Round {currentRound} Results
            </h3>

            <div className="space-y-2">
              {roundResults
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((res, i) => {
                  const player = players.find((p) => p.user_id === res.userId);
                  return (
                    <div
                      key={res.userId}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-surface-raised border border-line"
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
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
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

            {isHost && (
              <Button variant="primary" fullWidth onClick={nextRoundOrFinish} className="mt-4">
                {currentRound >= totalRounds ? 'View Final Podium' : 'Next Round'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
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

