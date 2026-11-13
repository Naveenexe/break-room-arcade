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
      id: 'quiz',
      title: 'Quick Draw Quiz',
      cover: '/art/cover-quiz.webp',
      accent: 'border-game-quiz',
      accentBadge: 'bg-game-quiz text-ink',
      desc: 'Speed multiple-choice buzzer with streaks and jackpot questions.',
      players: '4–12 Players',
      duration: 'About 4 mins',
    },
    {
      id: 'typing',
      title: 'Typing Race',
      cover: '/art/cover-typing.webp',
      accent: 'border-game-typing',
      accentBadge: 'bg-game-typing text-ink',
      desc: 'Race your friends along visual lanes with increasing difficulty.',
      players: '4–12 Players',
      duration: 'About 4 mins',
    },
    {
      id: 'reaction',
      title: 'Reaction Duel',
      cover: '/art/cover-reaction.webp',
      accent: 'border-game-reaction',
      accentBadge: 'bg-game-reaction text-ink',
      desc: 'Classic, Decoy, and Target tap rounds with hardware timestamping.',
      players: '4–12 Players',
      duration: 'About 2 mins',
    },
    {
      id: 'pictionary',
      title: 'Pictionary',
      cover: '/art/cover-pictionary.webp',
      accent: 'border-game-pictionary',
      accentBadge: 'bg-game-pictionary text-ink',
      desc: 'Live shared drawing canvas, letter hints, and close-guess clues.',
      players: '4–12 Players',
      duration: 'About 6 mins',
    },
    {
      id: 'charades',
      title: 'Emoji Charades',
      cover: '/art/cover-charades.webp',
      accent: 'border-game-charades',
      accentBadge: 'bg-game-charades text-ink',
      desc: 'Act out secret prompts using only emojis. No letters or digits.',
      players: '4–12 Players',
      duration: 'About 5 mins',
    },
    {
      id: 'wordchain',
      title: 'Word Chain Blitz',
      cover: '/art/cover-wordchain.webp',
      accent: 'border-game-wordchain',
      accentBadge: 'bg-game-wordchain text-ink',
      desc: 'Elimination word duels with Classic, Long Words, and Speed rounds.',
      players: '4–12 Players',
      duration: 'About 4 mins',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-start gap-10 py-6 sunset-glow">
      {/* Hero Header with Cut-Paper Skyline Illustration */}
      <div className="w-full max-w-4xl px-4 flex flex-col items-center text-center">
        <div className="w-full h-44 sm:h-64 rounded-2xl overflow-hidden border-2 border-line shadow-tile mb-6 relative">
          <img
            src="/art/hero-skyline.webp"
            alt="Golden hour rooftop with friends silhouettes against city skyline"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-80" />
          <div className="absolute bottom-3 left-4 right-4 text-left">
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary px-2.5 py-0.5 rounded-md bg-surface/90 border border-line">
              Break Room Arcade • Golden Hour Edition
            </span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold font-heading tracking-tight text-text leading-tight">
          Quick breaks.<br />
          <span className="text-primary">Serious party fun.</span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-text-muted max-w-xl">
          Hop into a shared room with friends and colleagues. No installs, fair timing, and zero hassle.
        </p>

        {/* Primary Action Tiles */}
        <div className="w-full max-w-md flex flex-col sm:flex-row gap-3.5 mt-6">
          <Link to={user ? "/create" : "/login"} className="flex-1">
            <Button variant="primary" size="lg" fullWidth>
              <PlusCircle className="w-5 h-5 mr-2" />
              Host a Room
            </Button>
          </Link>
          <Link to={user ? "/join" : "/login"} className="flex-1">
            <Button variant="secondary" size="lg" fullWidth>
              <LogIn className="w-5 h-5 mr-2" />
              Join a Room
            </Button>
          </Link>
        </div>

        {/* Quick Join Code Input */}
        <form onSubmit={handleQuickJoin} className="w-full max-w-xs flex items-center gap-2 mt-4">
          <Input
            placeholder="5-LETTER CODE"
            value={quickCode}
            onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
            maxLength={5}
            className="text-center font-heading font-black uppercase tracking-widest text-lg"
          />
          <Button
            type="submit"
            variant="surface"
            disabled={quickCode.trim().length !== 5}
            className="min-h-[48px] px-3.5"
            title="Join Room"
          >
            <ArrowRight className="w-5 h-5" />
          </Button>
        </form>
      </div>

      {/* Six Game Showcase Cards */}
      <div className="w-full max-w-5xl px-4 mt-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold font-heading text-text flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary" />
            The Game Lineup
          </h2>
          <span className="text-xs text-text-muted">6 games • 4 to 12 players</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map((g) => (
            <div
              key={g.id}
              className={`rounded-card tile overflow-hidden flex flex-col justify-between group hover:border-primary transition-all`}
            >
              <div className="relative h-36 w-full overflow-hidden bg-surface-raised border-b-2 border-line">
                <img
                  src={g.cover}
                  alt={g.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <span className={`absolute top-2.5 right-2.5 text-xs font-heading font-black px-2.5 py-0.5 rounded-[8px] border border-ink shadow-sm ${g.accentBadge}`}>
                  {g.duration}
                </span>
              </div>

              <div className="p-4 flex flex-col flex-1 justify-between">
                <div>
                  <h3 className="font-heading font-bold text-lg text-text group-hover:text-primary transition-colors">
                    {g.title}
                  </h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-2">
                    {g.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-line/40 flex items-center justify-between text-xs text-text-muted">
                  <span>{g.players}</span>
                  <span className="text-success font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-success inline-block" /> Ready
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
