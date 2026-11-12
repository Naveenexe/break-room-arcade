import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlusCircle, LogIn, Gamepad2, ArrowRight } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useAuthStore();
  const [quickCode, setQuickCode] = useState('');
  const navigate = useNavigate();

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickCode.trim().toUpperCase();
    if (clean.length === 5) {
      navigate(`/join/${clean}`);
    }
  };

  const games = [
    {
      title: 'Pictionary',
      color: 'bg-game-pictionary text-bg',
      border: 'border-game-pictionary',
      desc: 'Shared live drawing canvas. Fast guesses, letter hints & so-close clues.',
      icon: '🎨',
      players: '4-12 Players',
      duration: '5-10 Mins',
    },
    {
      title: 'Emoji Charades',
      color: 'bg-game-charades text-bg',
      border: 'border-game-charades',
      desc: 'Act out movies, office phrases and food using only expressive emojis.',
      icon: '🎭',
      players: '4-12 Players',
      duration: '5-8 Mins',
    },
    {
      title: 'Word Chain Blitz',
      color: 'bg-game-wordchain text-bg',
      border: 'border-game-wordchain',
      desc: 'Rapid turn elimination. Connect words with shrinking turn timers.',
      icon: '🔗',
      players: '4-12 Players',
      duration: '3-6 Mins',
    },
    {
      title: 'Reaction Duel',
      color: 'bg-game-reaction text-bg',
      border: 'border-game-reaction',
      desc: 'Wait for green... and tap! Local millisecond precision for total fairness.',
      icon: '⚡',
      players: '4-12 Players',
      duration: '2-4 Mins',
    },
    {
      title: 'Typing Race',
      color: 'bg-game-typing text-bg',
      border: 'border-game-typing',
      desc: 'Live racing lanes! Type funny office passages and test your WPM.',
      icon: '🏁',
      players: '4-12 Players',
      duration: '3-5 Mins',
    },
    {
      title: 'Quick Draw Quiz',
      color: 'bg-game-quiz text-bg',
      border: 'border-game-quiz',
      desc: 'Speed multiple-choice. Streaks, instant reveals, and zero server leaks.',
      icon: '💡',
      players: '4-12 Players',
      duration: '4-7 Mins',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-start gap-10 py-4 hero-spotlight">
      {/* Hero Header */}
      <div className="text-center max-w-2xl px-4 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-raised border border-line text-xs font-semibold text-primary mb-4 shadow-sm">
          <span>✨ 6 Realtime Party Games • 4 to 12 Players</span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black font-heading tracking-tight text-text leading-tight">
          Quick breaks.<br />
          <span className="text-primary">Serious party fun.</span>
        </h1>
        <p className="mt-3 text-base sm:text-lg text-text-muted">
          Hop into a shared room with friends and colleagues. No installs, fair timing, and zero hassle.
        </p>
      </div>

      {/* Primary Actions (FR-ROOM-1) */}
      <div className="w-full max-w-md flex flex-col sm:flex-row gap-4 px-4">
        <Link to={user ? "/create" : "/login"} className="flex-1">
          <Button variant="primary" size="lg" fullWidth className="text-lg">
            <PlusCircle className="w-5 h-5 mr-2" />
            Create Room
          </Button>
        </Link>
        <Link to={user ? "/join" : "/login"} className="flex-1">
          <Button variant="secondary" size="lg" fullWidth className="text-lg">
            <LogIn className="w-5 h-5 mr-2" />
            Join Room
          </Button>
        </Link>
      </div>

      {/* Quick Join Code Input */}
      <form onSubmit={handleQuickJoin} className="w-full max-w-sm flex items-center gap-2 px-4">
        <Input
          placeholder="ENTER 5-LETTER CODE"
          value={quickCode}
          onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
          maxLength={5}
          className="text-center font-heading font-bold uppercase tracking-widest text-lg"
        />
        <Button
          type="submit"
          variant="surface"
          disabled={quickCode.trim().length !== 5}
          className="min-h-[48px] px-4"
        >
          <ArrowRight className="w-5 h-5" />
        </Button>
      </form>

      {/* Six Game Showcase Cards */}
      <div className="w-full max-w-5xl px-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold font-heading text-text flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary" />
            The Game Lineup
          </h2>
          <span className="text-xs text-text-muted">Host chooses or room votes</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((g) => (
            <div
              key={g.title}
              className="p-5 rounded-card bg-surface border-2 border-line hover:border-primary/50 transition-all flex flex-col justify-between group shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl p-2 rounded-2xl bg-surface-raised border border-line">
                    {g.icon}
                  </span>
                  <span className={`text-xs font-heading font-bold px-2.5 py-1 rounded-full ${g.color}`}>
                    {g.duration}
                  </span>
                </div>
                <h3 className="font-heading font-bold text-xl text-text group-hover:text-primary transition-colors">
                  {g.title}
                </h3>
                <p className="text-sm text-text-muted mt-1 leading-relaxed">
                  {g.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-line/40 flex items-center justify-between text-xs text-text-muted">
                <span>{g.players}</span>
                <span className="text-success font-semibold">Ready to play</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
