import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sound } from '@/lib/sound';
import { dictionary } from '@/data/dictionary';
import { computeWordChainScore } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Link2, AlertCircle, Clock, Send } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface WordChainBlitzProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

export const WordChainBlitz: React.FC<WordChainBlitzProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  const [activePlayers, setActivePlayers] = useState<string[]>(() => {
    // Randomize initial turn order (WCB-5)
    return [...players].map((p) => p.user_id).sort(() => 0.5 - Math.random());
  });

  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [wordChain, setWordChain] = useState<string[]>(['arcade']); // starting starter word
  const [currentWordInput, setCurrentWordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [turnLimitSecs, setTurnLimitSecs] = useState(10);
  const [remainingSecs, setRemainingSecs] = useState(10);
  const [wordCounts, setWordCounts] = useState<{ [uid: string]: number }>({});
  const [eliminatedOrder, setEliminatedOrder] = useState<string[]>([]);
  const [isDictLoaded, setIsDictLoaded] = useState(false);

  const turnTimerRef = useRef<number | null>(null);
  const currentTurnUserId = activePlayers[currentTurnIdx];
  const isMyTurn = currentTurnUserId === userId;

  const previousWord = wordChain[wordChain.length - 1];
  const requiredLetter = previousWord[previousWord.length - 1].toUpperCase();

  // Load Dictionary (WCB-8)
  useEffect(() => {
    dictionary.load().then((loaded) => {
      setIsDictLoaded(loaded);
    });
  }, []);

  // Turn Timer with Shrinking Bar (WCB-2)
  const resetTurnTimer = (limit: number) => {
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    setRemainingSecs(limit);

    turnTimerRef.current = window.setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          clearInterval(turnTimerRef.current!);
          eliminateCurrentPlayer();
          return 0;
        }
        if (prev <= 4) sound.playTick();
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (activePlayers.length > 1) {
      resetTurnTimer(turnLimitSecs);
    }
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [currentTurnIdx, turnLimitSecs, activePlayers.length]);

  // Realtime Broadcast for Word Submissions and Eliminations
  useEffect(() => {
    const channel = supabase.channel(`wordchain:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'word_submitted' }, ({ payload }) => {
        setWordChain((prev) => [...prev, payload.word]);
        setWordCounts((prev) => ({
          ...prev,
          [payload.userId]: (prev[payload.userId] || 0) + 1,
        }));
        setTurnLimitSecs((prev) => Math.max(4, prev - 0.5));
        setCurrentTurnIdx((idx) => (idx + 1) % activePlayers.length);
        sound.playCorrect();
      })
      .on('broadcast', { event: 'player_eliminated' }, ({ payload }) => {
        handleElimination(payload.userId);
      })
      .on('broadcast', { event: 'wordchain_finished' }, ({ payload }) => {
        onFinishGame(payload.finalScores);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, activePlayers.length]);

  // Eliminate Player on Timeout (WCB-4)
  const eliminateCurrentPlayer = async () => {
    const eliminatedId = activePlayers[currentTurnIdx];
    handleElimination(eliminatedId);

    const channel = supabase.channel(`wordchain:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'player_eliminated',
      payload: { userId: eliminatedId },
    });
  };

  const handleElimination = (eliminatedId: string) => {
    sound.playWrong();
    setEliminatedOrder((prev) => [...prev, eliminatedId]);

    const remaining = activePlayers.filter((id) => id !== eliminatedId);
    setActivePlayers(remaining);

    if (remaining.length <= 1) {
      // Game over! Winner found (WCB-6)
      const winnerId = remaining[0] || eliminatedId;
      finishGame(winnerId, [...eliminatedOrder, eliminatedId]);
    } else {
      setCurrentTurnIdx((idx) => idx % remaining.length);
    }
  };

  const finishGame = async (winnerId: string, eliminatedList: string[]) => {
    const finalScores: { [uid: string]: number } = {};
    const reversedElim = [...eliminatedList].reverse(); // 2nd, 3rd, etc.

    // Winner
    finalScores[winnerId] = computeWordChainScore(wordCounts[winnerId] || 0, 1);

    // 2nd, 3rd, and others
    reversedElim.forEach((uid, index) => {
      const placement = index + 2;
      finalScores[uid] = computeWordChainScore(wordCounts[uid] || 0, placement);
    });

    const channel = supabase.channel(`wordchain:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'wordchain_finished',
      payload: { finalScores },
    });

    onFinishGame(finalScores);
  };

  // Submit Word (WCB-1, WCB-3)
  const handleSubmitWord = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isMyTurn) return;

    const clean = currentWordInput.trim().toLowerCase();

    // 1. Length check
    if (clean.length < 3) {
      setErrorMsg('Word must have at least 3 letters.');
      sound.playWrong();
      return;
    }

    // 2. Letters only
    if (!/^[a-z]+$/.test(clean)) {
      setErrorMsg('Letters only (no spaces or numbers).');
      sound.playWrong();
      return;
    }

    // 3. Must start with last letter of previous word
    if (clean[0].toUpperCase() !== requiredLetter) {
      setErrorMsg(`Must start with letter "${requiredLetter}"!`);
      sound.playWrong();
      return;
    }

    // 4. Duplicate check
    if (wordChain.includes(clean)) {
      setErrorMsg(`"${clean}" has already been used this match!`);
      sound.playWrong();
      return;
    }

    // 5. Dictionary validation
    if (!dictionary.isValid(clean)) {
      setErrorMsg(`"${clean}" is not in the dictionary.`);
      sound.playWrong();
      return;
    }

    // Success!
    setCurrentWordInput('');
    setWordChain((prev) => [...prev, clean]);
    setWordCounts((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) + 1,
    }));
    sound.playCorrect();

    // Shrink timer by 0.5s down to 4s (WCB-2)
    const nextLimit = Math.max(4, turnLimitSecs - 0.5);
    setTurnLimitSecs(nextLimit);
    setCurrentTurnIdx((idx) => (idx + 1) % activePlayers.length);

    const channel = supabase.channel(`wordchain:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'word_submitted',
      payload: { word: clean, userId },
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full py-4 space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-game-wordchain" />
          <span className="font-heading font-bold text-lg text-text">Word Chain Blitz</span>
        </div>

        <div className="flex items-center gap-4">
          {!isDictLoaded && (
            <span className="text-xs text-danger font-bold animate-pulse">
              Dictionary loading…
            </span>
          )}
          <span className="text-xs text-text-muted font-semibold">
            {activePlayers.length} Players Remaining
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-line text-sm font-heading font-black">
            <Clock className="w-4 h-4 text-warn" />
            <span className={remainingSecs <= 3 ? 'text-danger animate-pulse' : 'text-text'}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Turn Display */}
      <div className="bg-surface p-6 md:p-8 rounded-card border-2 border-line text-center space-y-6 shadow-xl">
        {/* Next Letter Big Callout (WCB-2) */}
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Word must start with:
          </span>
          <div className="text-7xl md:text-8xl font-heading font-black text-game-wordchain filter drop-shadow">
            {requiredLetter}
          </div>
          <span className="text-xs text-text-muted">
            Previous word: <strong className="text-text">{previousWord}</strong>
          </span>
        </div>

        {/* Dynamic Shrinking Turn Timer Bar */}
        <div className="w-full bg-surface-raised h-3 rounded-full overflow-hidden border border-line">
          <div
            className={`h-full transition-all duration-1000 ${
              remainingSecs <= 3 ? 'bg-danger' : 'bg-primary'
            }`}
            style={{ width: `${(remainingSecs / turnLimitSecs) * 100}%` }}
          />
        </div>

        {/* Current Turn Indicator */}
        <div className="flex items-center justify-center gap-3">
          <Avatar
            avatarId={players.find((p) => p.user_id === currentTurnUserId)?.profile?.avatar_id || 'avatar-01'}
            name={players.find((p) => p.user_id === currentTurnUserId)?.profile?.display_name || 'Player'}
            size="md"
          />
          <div className="text-left">
            <span className="block text-xs uppercase font-bold text-text-muted">Current Turn</span>
            <span className="font-heading font-bold text-lg text-text">
              {isMyTurn ? "It's your turn!" : players.find((p) => p.user_id === currentTurnUserId)?.profile?.display_name}
            </span>
          </div>
        </div>

        {/* Input Form for Current Player */}
        {isMyTurn ? (
          <form onSubmit={handleSubmitWord} className="max-w-md mx-auto space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={`Type a word starting with ${requiredLetter}…`}
                value={currentWordInput}
                onChange={(e) => setCurrentWordInput(e.target.value)}
                autoFocus
                className="font-heading font-bold text-lg"
              />
              <Button type="submit" variant="primary">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {errorMsg && (
              <span className="text-xs font-bold text-danger flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4" /> {errorMsg}
              </span>
            )}
          </form>
        ) : (
          <div className="text-xs text-text-muted">
            Waiting for {players.find((p) => p.user_id === currentTurnUserId)?.profile?.display_name} to link a word…
          </div>
        )}
      </div>

      {/* Chain So Far (WCB-7) */}
      <div className="bg-surface p-4 rounded-card border-2 border-line space-y-2 shadow-lg">
        <span className="text-xs uppercase font-bold text-text-muted flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          Chain So Far ({wordChain.length} words)
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm font-heading font-bold">
          {wordChain.slice(-10).map((w, idx) => (
            <span
              key={idx}
              className="px-3 py-1 rounded-full bg-surface-raised border border-line flex-shrink-0"
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
