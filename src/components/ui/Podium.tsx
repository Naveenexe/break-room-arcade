import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { Trophy, RotateCcw, LayoutGrid, Home } from 'lucide-react';

export interface PodiumPlayer {
  userId: string;
  displayName: string;
  avatarId: string;
  gameScore: number;
  totalScore: number;
  rank: number;
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

    // Trigger celebration confetti
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF5FA2', '#3DDBB0', '#FFD23F', '#4DB5FF', '#FF8A3D'],
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

  const first = players.find((p) => p.rank === 1) || players[0];
  const second = players.find((p) => p.rank === 2) || players[1];
  const third = players.find((p) => p.rank === 3) || players[2];

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-6 px-4 max-w-4xl mx-auto w-full podium-spotlight space-y-8 animate-fade">
      {/* Title */}
      <div className="text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warn/20 border border-warn/30 text-warn text-xs font-bold">
          <Trophy className="w-4 h-4" />
          <span>Match Complete • {gameTitle}</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black font-heading text-text">The Winners Podium</h1>
      </div>

      {/* Top 3 Visual Podium */}
      <div className="flex items-end justify-center gap-3 sm:gap-6 w-full max-w-2xl pt-8 pb-2">
        {/* 2nd Place */}
        {second && (
          <div className="flex-1 flex flex-col items-center animate-slide-up" style={{ animationDelay: '150ms' }}>
            <Avatar avatarId={second.avatarId} name={second.displayName} size="lg" />
            <span className="font-heading font-bold text-sm text-text mt-2 text-center truncate max-w-full">
              {second.displayName}
            </span>
            <span className="text-xs text-text-muted font-bold">+{second.gameScore} pts</span>

            <div className="w-full h-28 sm:h-36 bg-surface-raised rounded-t-card border-2 border-line border-b-0 mt-3 flex flex-col items-center justify-center shadow-lg">
              <span className="text-3xl sm:text-4xl font-heading font-black text-text-muted">2</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Silver</span>
            </div>
          </div>
        )}

        {/* 1st Place */}
        {first && (
          <div className="flex-1 flex flex-col items-center -mt-6 animate-slide-up">
            <div className="relative">
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl filter drop-shadow">👑</span>
              <Avatar avatarId={first.avatarId} name={first.displayName} size="xl" />
            </div>
            <span className="font-heading font-black text-base sm:text-lg text-primary mt-2 text-center truncate max-w-full">
              {first.displayName}
            </span>
            <span className="text-xs sm:text-sm text-warn font-extrabold">+{first.gameScore} pts</span>

            <div className="w-full h-40 sm:h-48 bg-warn/20 rounded-t-card border-2 border-warn/60 border-b-0 mt-3 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
              <span className="text-5xl sm:text-6xl font-heading font-black text-warn">1</span>
              <span className="text-xs font-bold uppercase tracking-widest text-warn">Winner</span>
            </div>
          </div>
        )}

        {/* 3rd Place */}
        {third && (
          <div className="flex-1 flex flex-col items-center animate-slide-up" style={{ animationDelay: '300ms' }}>
            <Avatar avatarId={third.avatarId} name={third.displayName} size="lg" />
            <span className="font-heading font-bold text-sm text-text mt-2 text-center truncate max-w-full">
              {third.displayName}
            </span>
            <span className="text-xs text-text-muted font-bold">+{third.gameScore} pts</span>

            <div className="w-full h-20 sm:h-24 bg-surface rounded-t-card border-2 border-line border-b-0 mt-3 flex flex-col items-center justify-center shadow-md">
              <span className="text-2xl sm:text-3xl font-heading font-black text-text-muted">3</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Bronze</span>
            </div>
          </div>
        )}
      </div>

      {/* Cumulative Session Scoreboard (FR-ROOM-8) */}
      <div className="w-full max-w-md bg-surface p-5 rounded-card border-2 border-line shadow-xl space-y-3">
        <h3 className="font-heading font-bold text-base text-text flex items-center justify-between">
          <span>Cumulative Room Scores</span>
          <span className="text-xs font-normal text-text-muted">All sessions</span>
        </h3>

        <div className="divide-y divide-line/40 max-h-48 overflow-y-auto">
          {players.map((p, idx) => (
            <div key={p.userId} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-heading font-bold text-sm text-text-muted w-5">#{idx + 1}</span>
                <Avatar avatarId={p.avatarId} name={p.displayName} size="sm" />
                <span className="font-semibold text-sm text-text">{p.displayName}</span>
              </div>
              <div className="text-right">
                <span className="font-heading font-bold text-sm text-primary">{p.totalScore} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons (FR-ROOM-9) */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2 w-full max-w-md">
        {isHost ? (
          <>
            <Button variant="primary" size="lg" onClick={onPlayAgain} className="flex-1 min-w-[140px]">
              <RotateCcw className="w-5 h-5 mr-2" />
              Play Again
            </Button>
            <Button variant="secondary" size="lg" onClick={onPickAnotherGame} className="flex-1 min-w-[140px]">
              <LayoutGrid className="w-5 h-5 mr-2" />
              Pick Game
            </Button>
          </>
        ) : (
          <div className="text-xs text-text-muted p-2 rounded-full bg-surface-raised border border-line">
            Waiting for host to pick the next game…
          </div>
        )}
        <Button variant="surface" size="md" onClick={onBackToLobby} className="w-full">
          <Home className="w-4 h-4 mr-2" />
          Back to Lobby
        </Button>
      </div>
    </div>
  );
};

