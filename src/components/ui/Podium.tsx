import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { Trophy, RotateCcw, LayoutGrid, Home, Award } from 'lucide-react';

export interface PodiumPlayer {
  userId: string;
  displayName: string;
  avatarId: string;
  gameScore: number;
  totalScore: number;
  rank: number;
  badge?: string;
}

interface PodiumProps {
  players: PodiumPlayer[];
  gameTitle: string;
  isHost: boolean;
  onPlayAgain: () => void;
  onPickAnotherGame: () => void;
  onBackToLobby: () => void;
}

export const Podium: React.FC<PodiumProps> = ({
  players,
  gameTitle,
  isHost,
  onPlayAgain,
  onPickAnotherGame,
  onBackToLobby,
}) => {
  useEffect(() => {
    // Sound victory fanfare
    sound.playFanfare();

    // Trigger celebration confetti (respect prefers-reduced-motion)
    const prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFB627', '#FF7A59', '#B6E35B', '#5CC8FF', '#B9A4FF', '#FF8FB8'],
      });

      const timer = setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 60,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 400);

      return () => clearTimeout(timer);
    }
  }, []);

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.rank > 0 && b.rank > 0) return a.rank - b.rank;
    return b.totalScore - a.totalScore;
  });

  const first = sortedPlayers.find((p) => p.rank === 1) || sortedPlayers[0];
  const second = sortedPlayers.find((p) => p.rank === 2) || sortedPlayers[1];
  const third = sortedPlayers.find((p) => p.rank === 3) || sortedPlayers[2];

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-6 px-4 max-w-4xl mx-auto w-full podium-glow space-y-8 animate-fade">
      {/* Title Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[10px] bg-primary/20 border border-primary/40 text-primary text-xs font-bold uppercase tracking-wider">
          <Trophy className="w-4 h-4 text-primary" />
          <span>Match Complete • {gameTitle}</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold font-heading text-text">
          The Winners Podium
        </h1>
      </div>

      {/* Top 3 Visual Podium (Section 5.5) */}
      <div className="flex items-end justify-center gap-3 sm:gap-6 w-full max-w-2xl pt-8 pb-2">
        {/* 2nd Place */}
        {second && (
          <div className="flex-1 flex flex-col items-center">
            <Avatar avatarId={second.avatarId} name={second.displayName} size="lg" />
            <span className="font-heading font-bold text-sm text-text mt-2 text-center truncate max-w-full">
              {second.displayName}
            </span>
            <span className="text-xs text-text-muted font-bold font-heading">
              +{second.gameScore} raw
            </span>

            <div className="w-full h-28 sm:h-36 bg-surface-raised rounded-t-[16px] border-2 border-line border-b-0 mt-3 flex flex-col items-center justify-center shadow-tile relative">
              <span className="text-3xl sm:text-4xl font-heading font-black text-text-muted">2</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">+7 Arcade Pts</span>
            </div>
          </div>
        )}

        {/* 1st Place */}
        {first && (
          <div className="flex-1 flex flex-col items-center -mt-6">
            <div className="relative">
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl filter drop-shadow">👑</span>
              <Avatar avatarId={first.avatarId} name={first.displayName} size="xl" />
            </div>
            <span className="font-heading font-extrabold text-base sm:text-lg text-primary mt-2 text-center truncate max-w-full">
              {first.displayName}
            </span>
            <span className="text-xs sm:text-sm text-primary font-black font-heading">
              +{first.gameScore} raw
            </span>

            <div className="w-full h-40 sm:h-48 bg-primary/20 rounded-t-[16px] border-2 border-primary border-b-0 mt-3 flex flex-col items-center justify-center shadow-tile-lg relative">
              <span className="text-5xl sm:text-6xl font-heading font-black text-primary">1</span>
              <span className="text-xs font-black uppercase tracking-wider text-primary">+10 Arcade Pts</span>
            </div>
          </div>
        )}

        {/* 3rd Place */}
        {third && (
          <div className="flex-1 flex flex-col items-center">
            <Avatar avatarId={third.avatarId} name={third.displayName} size="lg" />
            <span className="font-heading font-bold text-sm text-text mt-2 text-center truncate max-w-full">
              {third.displayName}
            </span>
            <span className="text-xs text-text-muted font-bold font-heading">
              +{third.gameScore} raw
            </span>

            <div className="w-full h-20 sm:h-24 bg-surface rounded-t-[16px] border-2 border-line border-b-0 mt-3 flex flex-col items-center justify-center shadow-tile-sm relative">
              <span className="text-2xl sm:text-3xl font-heading font-black text-text-muted">3</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">+5 Arcade Pts</span>
            </div>
          </div>
        )}
      </div>

      {/* Cumulative Session Standings (E-24, E-25) */}
      <div className="w-full max-w-md tile p-5 space-y-3">
        <h3 className="font-heading font-bold text-base text-text flex items-center justify-between border-b border-line pb-2.5">
          <span className="flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Session Standings (Arcade Points)
          </span>
          <span className="text-xs font-normal text-text-muted">Room Total</span>
        </h3>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {sortedPlayers.map((p, idx) => (
            <div
              key={p.userId}
              className="flex items-center justify-between p-2 rounded-[10px] bg-surface-raised border border-line"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center font-heading font-black text-sm text-text-muted">
                  {idx === 0 ? '👑' : `#${idx + 1}`}
                </span>
                <Avatar avatarId={p.avatarId} name={p.displayName} size="sm" />
                <span className="font-heading font-bold text-sm text-text truncate max-w-[150px]">
                  {p.displayName}
                </span>
              </div>
              <span className="font-heading font-black text-sm text-primary tabular-nums">
                {p.totalScore} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Host / Player Navigation Controls */}
      <div className="w-full max-w-md flex flex-col sm:flex-row gap-3 pt-2">
        {isHost ? (
          <>
            <Button variant="primary" size="lg" fullWidth onClick={onPlayAgain}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={onPickAnotherGame}>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Pick Another Game
            </Button>
          </>
        ) : (
          <Button variant="surface" size="lg" fullWidth onClick={onBackToLobby}>
            <Home className="w-4 h-4 mr-2" />
            Back to Lobby
          </Button>
        )}
      </div>
    </div>
  );
};
