import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeGuesserScore, computeDrawerScore, evaluateGuess } from '@/lib/scoring';
import { SEED_CHARADES, CharadesSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Smile, Send, Clock, SkipForward } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface EmojiCharadesProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

const COMMON_EMOJIS = [
  '🎬', '🍿', '👑', '🦁', '🕷️', '🦖', '🎈', '🚢', '❄️', '🚀', '🧙‍♂️', '🤠', '👻', '🏠', '🏴‍☠️', '🦇',
  '💼', '☕', '💻', '📈', '📉', '⏰', '🍕', '🍔', '🌮', '🍩', '🥑', '🏖️', '🌲', '🚗', '✈️', '🐶',
  '❤️', '💔', '🔥', '💡', '🎉', '😴', '👀', '🤐', '🏃', '🏊', '💃', '🕺', '🧘', '🎤', '🎸', '⚽'
];

export const EmojiCharades: React.FC<EmojiCharadesProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  const [actorIndex, setActorIndex] = useState(0);
  const currentActor = players[actorIndex] || players[0];
  const isActor = currentActor.user_id === userId;

  const [promptItem] = useState<CharadesSeedItem>(() => {
    return SEED_CHARADES[Math.floor(Math.random() * SEED_CHARADES.length)];
  });

  const [emojiClue, setEmojiClue] = useState<string>('');
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState<{ sender: string; text: string; isCorrect?: boolean; isClose?: boolean }[]>([]);
  const [correctGuessers, setCorrectGuessers] = useState<string[]>([]);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [hasSkipped, setHasSkipped] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(60);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});

  const roundStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<number | null>(null);

  // Realtime Broadcast for Live Clues and Guesses
  useEffect(() => {
    const channel = supabase.channel(`charades:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'clue_update' }, ({ payload }) => {
        setEmojiClue(payload.clue);
      })
      .on('broadcast', { event: 'guess_message' }, ({ payload }) => {
        setChatLog((prev) => [...prev, payload]);
        if (payload.isCorrect && !correctGuessers.includes(payload.userId)) {
          setCorrectGuessers((prev) => [...prev, payload.userId]);
          sound.playCorrect();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [room.id, correctGuessers]);

  useEffect(() => {
    roundStartRef.current = timeSync.correctedNow();
    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.round((timeSync.correctedNow() - roundStartRef.current) / 1000);
      const left = Math.max(0, 60 - elapsed);
      setRemainingSecs(left);
      if (left <= 5 && left > 0) sound.playTick();
      if (left === 0) endRound();
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [actorIndex]);

  // Actor Adds Emoji to Clue (EMO-2)
  const addEmoji = async (emoji: string) => {
    if (!isActor) return;
    const nextClue = emojiClue + emoji;
    setEmojiClue(nextClue);

    const channel = supabase.channel(`charades:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'clue_update',
      payload: { clue: nextClue },
    });
  };

  const backspaceEmoji = async () => {
    if (!isActor || !emojiClue) return;
    const chars = Array.from(emojiClue);
    chars.pop();
    const nextClue = chars.join('');
    setEmojiClue(nextClue);

    const channel = supabase.channel(`charades:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'clue_update',
      payload: { clue: nextClue },
    });
  };

  // EMO-4: Skip Prompt (25-point penalty)
  const handleSkip = () => {
    if (!isActor || hasSkipped) return;
    setHasSkipped(true);
    setCumulativeScores((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) - 25,
    }));
    sound.playWrong();
  };

  // Submit Guess (EMO-3)
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guessInput.trim();
    if (!clean || hasGuessedCorrectly || isActor) return;

    setGuessInput('');
    const evaluation = evaluateGuess(clean, promptItem.prompt);

    const senderName = players.find((p) => p.user_id === userId)?.profile?.display_name || 'Player';

    if (evaluation === 'correct') {
      setHasGuessedCorrectly(true);
      const isFirst = correctGuessers.length === 0;
      const score = computeGuesserScore({
        remainingTimeMs: remainingSecs * 1000,
        totalTimeMs: 60000,
        isFirstCorrect: isFirst,
      });

      setCumulativeScores((prev) => ({
        ...prev,
        [userId]: (prev[userId] || 0) + score,
      }));

      const msg = {
        sender: senderName,
        text: 'Guessed the charade correctly! 🎉',
        isCorrect: true,
        userId,
      };

      setChatLog((prev) => [...prev, msg]);
      setCorrectGuessers((prev) => [...prev, userId]);
      sound.playCorrect();

      const channel = supabase.channel(`charades:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'guess_message',
        payload: msg,
      });
    } else {
      const isClose = evaluation === 'close';
      if (isClose) sound.playTick();

      const msg = {
        sender: senderName,
        text: isClose ? `${clean} (So close!)` : clean,
        isClose,
      };

      setChatLog((prev) => [...prev, msg]);

      const channel = supabase.channel(`charades:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'guess_message',
        payload: msg,
      });
    }
  };

  const endRound = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const guessersCount = correctGuessers.length;
    const allGuessed = guessersCount >= players.length - 1;
    const actorScore = computeDrawerScore(guessersCount, allGuessed);

    setCumulativeScores((prev) => ({
      ...prev,
      [currentActor.user_id]: (prev[currentActor.user_id] || 0) + actorScore,
    }));

    if (actorIndex < players.length - 1) {
      setActorIndex((idx) => idx + 1);
      setEmojiClue('');
      setCorrectGuessers([]);
      setHasGuessedCorrectly(false);
      setHasSkipped(false);
    } else {
      onFinishGame(cumulativeScores);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full py-2 space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Smile className="w-5 h-5 text-game-charades" />
          <span className="font-heading font-bold text-lg text-text">Emoji Charades</span>
          <span className="text-xs text-text-muted">
            • Actor: <strong>{currentActor.profile?.display_name || 'Player'}</strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-warn uppercase">
            {promptItem.hint}
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-line text-sm font-heading font-black">
            <Clock className="w-4 h-4 text-warn" />
            <span className={remainingSecs <= 10 ? 'text-danger animate-pulse' : 'text-text'}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* Actor Secret Prompt Card (EMO-1) */}
      {isActor && (
        <div className="p-4 bg-surface rounded-card border-2 border-warn flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[11px] uppercase font-bold text-warn">Your Secret Prompt</span>
            <h2 className="text-xl font-black font-heading text-text">{promptItem.prompt}</h2>
            <span className="text-xs text-text-muted">Category: {promptItem.category} • {promptItem.hint}</span>
          </div>

          <Button
            size="sm"
            variant="surface"
            disabled={hasSkipped}
            onClick={handleSkip}
            className="text-xs"
          >
            <SkipForward className="w-4 h-4 mr-1 text-warn" />
            {hasSkipped ? 'Skipped (-25)' : 'Skip (-25 pts)'}
          </Button>
        </div>
      )}

      {/* Main Grid: Left = Live Emoji Display + Picker, Right = Guesses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Emoji Display & Picker */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Big Clue Screen */}
          <div className="min-h-[160px] bg-surface rounded-card border-2 border-line p-6 flex items-center justify-center shadow-xl">
            {emojiClue ? (
              <span className="text-5xl md:text-6xl tracking-widest filter drop-shadow">
                {emojiClue}
              </span>
            ) : (
              <span className="text-sm font-heading font-bold text-text-muted animate-pulse">
                {isActor ? 'Tap emojis below to compose your clue…' : 'Actor is choosing emojis…'}
              </span>
            )}
          </div>

          {/* Emoji Keyboard for Actor */}
          {isActor && (
            <div className="p-4 bg-surface rounded-card border-2 border-line space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <span className="text-xs uppercase font-bold text-text-muted">Emoji Keyboard</span>
                <Button size="sm" variant="surface" onClick={backspaceEmoji} className="text-xs py-1 px-3">
                  ⌫ Delete
                </Button>
              </div>

              <div className="grid grid-cols-8 sm:grid-cols-12 gap-2 text-2xl">
                {COMMON_EMOJIS.map((em, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => addEmoji(em)}
                    className="p-2 rounded-xl bg-surface-raised border border-line hover:border-primary hover:scale-110 active:scale-95 transition-all text-center"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Guesses Box */}
        <div className="lg:col-span-4 bg-surface rounded-card border-2 border-line flex flex-col justify-between p-4 shadow-xl h-[380px]">
          <div>
            <span className="text-xs uppercase font-bold text-text-muted pb-2 border-b border-line block">
              Guesses & Clues
            </span>

            <div className="space-y-2 mt-3 max-h-[260px] overflow-y-auto pr-1">
              {chatLog.map((msg, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-xl text-xs ${
                    msg.isCorrect
                      ? 'bg-success/20 text-success font-bold border border-success/40'
                      : msg.isClose
                      ? 'bg-warn/20 text-warn font-semibold'
                      : 'bg-surface-raised text-text'
                  }`}
                >
                  <span className="font-bold opacity-75">{msg.sender}: </span>
                  <span>{msg.text}</span>
                </div>
              ))}
            </div>
          </div>

          {!isActor && (
            <form onSubmit={handleSubmitGuess} className="flex gap-2 pt-2 border-t border-line">
              <Input
                placeholder={hasGuessedCorrectly ? 'You got it!' : 'Guess the phrase…'}
                value={guessInput}
                disabled={hasGuessedCorrectly}
                onChange={(e) => setGuessInput(e.target.value)}
                className="text-xs"
              />
              <Button type="submit" size="sm" variant="primary" disabled={hasGuessedCorrectly}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          )}
        </div>
      </div>

      {isHost && (
        <div className="flex justify-end pt-2">
          <Button variant="surface" size="sm" onClick={endRound}>
            Next Actor / Finish
          </Button>
        </div>
      )}
    </div>
  );
};
