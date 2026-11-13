import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sound } from '@/lib/sound';
import {
  computeGuesserScore,
  computeDrawerScore,
  evaluateGuess,
} from '@/lib/scoring';
import { SEED_CHARADES, CharadesSeedItem } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import {
  Smile,
  Send,
  Clock,
  SkipForward,
  Delete,
  Trash2,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface ChatMessage {
  id: string;
  userId: string;
  sender: string;
  text: string;
  isCorrect?: boolean;
  isClose?: boolean;
  timestamp: number;
}

interface EmojiCharadesProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

// EMO-1: Categorized emoji picker bank
export const EMOJI_CATEGORIES = {
  Smileys: ['😀', '😂', '🥰', '😎', '🥳', '🤔', '😱', '🤫', '😴', '🤯', '🤠', '🤩', '🥺', '😇', '🤖', '👻', '💀', '🤡', '👽', '🤐'],
  Food: ['🍕', '🍔', '🍟', '🌭', '🍿', '🥞', '🌮', '🍣', '🍩', '🍪', '🍦', '🍫', '☕', '🧋', '🍺', '🍷', '🍎', '🥑', '🌶️', '🎂'],
  Animals: ['🐶', '🐱', '🦁', '🐯', '🐻', '🐼', '🐨', '🐵', '🦊', '🐰', '🐸', '🐙', '🦈', '🐬', '🦋', '🕷️', '🦖', '🦄', '🦉', '🦅'],
  Activities: ['⚽', '🏀', '🏈', '🎾', '🥊', '🏊', '🏄', '🧗', '🚴', '🏃', '💃', '🕺', '🧘', '🎤', '🎸', '🎮', '🎲', '🎳', '🎨', '🎬'],
  Objects: ['💡', '📱', '💻', '⏰', '🔑', '🚪', '🧳', '🚗', '✈️', '🚀', '🛸', '⛵', '👑', '💎', '🎁', '🎈', '📦', '💰', '💣', '🔫'],
  Symbols: ['❤️', '💔', '🔥', '✨', '⭐', '💥', '💯', '⚡', '⚠️', '🛑', '🚫', '❓', '❗', '💤', '🎵', '🏆', '🎯', '🥇', '💍', '🔔'],
} as const;

export const ROUND_DURATION_SECS = 60; // EMO-7
export const MAX_CLUE_EMOJIS = 20; // EMO-1 & EMO-2

/**
 * EMO-2: Character validation: Clue string must contain ONLY standard Unicode emojis.
 * Any character that is ASCII alphanumeric, Latin punctuation, digits, flags,
 * or regional indicators must be rejected and stripped immediately.
 * Clue length capped at 20 emojis.
 */
export function validateEmojiOnly(input: string): string {
  if (!input) return '';

  // Filter out ASCII characters, numbers, latin punctuation, and regional indicators (flags)
  // \u{1F1E6}-\u{1F1FF} are regional indicator letters used in flag emoji sequences
  const filtered = Array.from(input)
    .filter((char) => {
      // Reject ASCII characters, digits, Latin punctuation
      if (/[\u0000-\u007F]/.test(char)) return false;
      // Reject regional indicator flag symbols
      if (/[\u{1F1E6}-\u{1F1FF}]/u.test(char)) return false;
      // Accept Extended Pictographic symbols
      return /\p{Extended_Pictographic}/u.test(char);
    })
    .slice(0, MAX_CLUE_EMOJIS);

  return filtered.join('');
}

export const EmojiCharades: React.FC<EmojiCharadesProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  const gameState = room.game_state || {};
  const roundNo = Math.max(1, (gameState.round as number) || 1);
  const totalRounds = players.length; // Each player acts once

  // Current actor rotates each round
  const actorIndex = (roundNo - 1) % players.length;
  const currentActor = players[actorIndex] || players[0];
  const isActor = currentActor.user_id === userId;

  // Prompts and skip tracking (EMO-4)
  const [currentPrompt, setCurrentPrompt] = useState<CharadesSeedItem>(() => {
    return SEED_CHARADES[Math.floor(Math.random() * SEED_CHARADES.length)];
  });
  const [skipCount, setSkipCount] = useState(0);

  // Clue and Recents state (EMO-1)
  const [activeTab, setActiveTab] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');
  const [recents, setRecents] = useState<string[]>([]);
  const [emojiClue, setEmojiClue] = useState<string>('');

  // Guessing state (EMO-5)
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [correctGuessers, setCorrectGuessers] = useState<string[]>([]);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(ROUND_DURATION_SECS);
  const [lastGuessTime, setLastGuessTime] = useState<number>(0);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState<string | null>(null);

  // Cumulative game scores
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});
  void cumulativeScores;

  const roundStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<number | null>(null);
  const lastClueBroadcastRef = useRef<number>(0);

  // Reset round state on round advance
  useEffect(() => {
    const picked = SEED_CHARADES[Math.floor(Math.random() * SEED_CHARADES.length)];
    setCurrentPrompt(picked);
    setSkipCount(0);
    setEmojiClue('');
    setChatLog([]);
    setCorrectGuessers([]);
    setHasGuessedCorrectly(false);
    setCloseFeedback(null);
    setRemainingSecs(ROUND_DURATION_SECS);
    roundStartRef.current = Date.now();
  }, [roundNo]);

  // Round Timer Countdown (60s per turn - EMO-7)
  useEffect(() => {
    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartRef.current) / 1000);
      const remaining = Math.max(0, ROUND_DURATION_SECS - elapsed);
      setRemainingSecs(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        handleRoundTimeout();
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [roundNo]);

  // Handle End of Round (Time Up or All Guessed)
  const handleRoundTimeout = useCallback(() => {
    sound.playApplause();

    // Calculate actor score
    const nonActorsCount = Math.max(1, players.length - 1);
    const allGuessed = correctGuessers.length === nonActorsCount;
    const actorPts = computeDrawerScore(correctGuessers.length, allGuessed);

    setCumulativeScores((prev) => {
      const updated = {
        ...prev,
        [currentActor.user_id]: (prev[currentActor.user_id] || 0) + actorPts,
      };

      if (roundNo >= totalRounds) {
        onFinishGame(updated);
      }
      return updated;
    });
  }, [players.length, correctGuessers.length, currentActor.user_id, roundNo, totalRounds, onFinishGame]);

  // Realtime Broadcast Channel Listener (EMO-3)
  useEffect(() => {
    const channel = supabase.channel(`charades:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'clue_updated' }, ({ payload }) => {
        setEmojiClue(payload.clue);
      })
      .on('broadcast', { event: 'prompt_skipped' }, () => {
        sound.playWrong();
      })
      .on('broadcast', { event: 'guess_received' }, ({ payload }) => {
        setChatLog((prev) => [...prev, payload]);
        if (payload.isCorrect && !correctGuessers.includes(payload.userId)) {
          setCorrectGuessers((prev) => [...prev, payload.userId]);
          sound.playCorrect();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, correctGuessers]);

  // Broadcast Clue Helper (Throttled <= 4/sec - EMO-3)
  const broadcastClue = useCallback(
    (clue: string) => {
      const now = Date.now();
      if (now - lastClueBroadcastRef.current >= 250) {
        lastClueBroadcastRef.current = now;
        const channel = supabase.channel(`charades:${room.id}`);
        channel.send({
          type: 'broadcast',
          event: 'clue_updated',
          payload: { clue },
        });
      }
    },
    [room.id]
  );

  // EMO-1: Actor Appends Emoji
  const handleAddEmoji = (emoji: string) => {
    if (!isActor) return;
    const currentList = Array.from(emojiClue);
    if (currentList.length >= MAX_CLUE_EMOJIS) return;

    const validatedNext = validateEmojiOnly(emojiClue + emoji);
    setEmojiClue(validatedNext);
    broadcastClue(validatedNext);

    // Update Recents row (up to 6 unique emojis)
    setRecents((prev) => [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 6));
  };

  // EMO-1: Dedicated Delete Button (Backspace 1)
  const handleDeleteEmoji = () => {
    if (!isActor || !emojiClue) return;
    const chars = Array.from(emojiClue);
    chars.pop();
    const next = chars.join('');
    setEmojiClue(next);
    broadcastClue(next);
  };

  // EMO-1: Clear All
  const handleClearAll = () => {
    if (!isActor) return;
    setEmojiClue('');
    broadcastClue('');
  };

  // EMO-4: Skip Prompt (25-point penalty, max 2 skips)
  const handleSkipPrompt = () => {
    if (!isActor || skipCount >= 2) return;

    setSkipCount((prev) => prev + 1);
    sound.playWrong();

    // Deduct 25 points from Actor
    setCumulativeScores((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) - 25,
    }));

    // Swap with spare prompt from bank
    const available = SEED_CHARADES.filter((p) => p.prompt !== currentPrompt.prompt);
    const nextPrompt = available[Math.floor(Math.random() * available.length)] || SEED_CHARADES[0];
    setCurrentPrompt(nextPrompt);
    setEmojiClue('');

    const channel = supabase.channel(`charades:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'prompt_skipped',
      payload: { skipCount: skipCount + 1 },
    });
  };

  // EMO-5: Guess Submission Flow
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guessInput.trim();
    if (!trimmed || isActor || hasGuessedCorrectly) return;

    // PIC-5 & EMO-5: Rate limit 1 guess per 800ms
    const now = Date.now();
    if (now - lastGuessTime < 800) {
      setRateLimitWarning(true);
      setTimeout(() => setRateLimitWarning(false), 800);
      return;
    }
    setLastGuessTime(now);

    const userProfile = players.find((p) => p.user_id === userId)?.profile;
    const senderName = userProfile?.display_name || 'Player';

    // Local evaluation
    const evaluation = evaluateGuess(trimmed, currentPrompt.prompt);
    let isCorrect = evaluation === 'correct';
    let isClose = evaluation === 'close';

    // Call authoritative RPC
    try {
      const { data } = await supabase.rpc('submit_guess', {
        p_room_id: room.id,
        p_round_no: roundNo,
        p_guess: trimmed,
      });
      if (data?.result === 'correct') isCorrect = true;
      if (data?.result === 'close') isClose = true;
    } catch {
      // Fallback to local evaluation
    }

    if (isClose) {
      setCloseFeedback(`" ${trimmed} " is so close! Keep going!`);
      setTimeout(() => setCloseFeedback(null), 3000);
    }

    if (isCorrect) {
      setHasGuessedCorrectly(true);
      sound.playCorrect();

      // Award guesser points
      const elapsedMs = (ROUND_DURATION_SECS - remainingSecs) * 1000;
      const pts = computeGuesserScore({
        remainingTimeMs: Math.max(0, ROUND_DURATION_SECS * 1000 - elapsedMs),
        totalTimeMs: ROUND_DURATION_SECS * 1000,
        isFirstCorrect: correctGuessers.length === 0,
      });

      setCumulativeScores((prev) => ({
        ...prev,
        [userId]: (prev[userId] || 0) + pts,
      }));

      const newGuessers = [...correctGuessers, userId];
      setCorrectGuessers(newGuessers);

      // Check if all non-actors have guessed
      const nonActorsCount = Math.max(1, players.length - 1);
      if (newGuessers.length >= nonActorsCount) {
        handleRoundTimeout();
      }
    }

    // Broadcast chat message
    const chatMsg: ChatMessage = {
      id: Math.random().toString(),
      userId,
      sender: senderName,
      text: isCorrect ? 'Guessed the prompt! 🎉' : trimmed,
      isCorrect,
      isClose,
      timestamp: Date.now(),
    };

    setChatLog((prev) => [...prev, chatMsg]);

    const channel = supabase.channel(`charades:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'guess_received',
      payload: chatMsg,
    });

    setGuessInput('');
  };

  // Automated Hints (EMO-6)
  const elapsedRatio = (ROUND_DURATION_SECS - remainingSecs) / ROUND_DURATION_SECS;
  const isHint1Active = elapsedRatio >= 0.5; // >= 50% elapsed (30s)
  const isHint2Active = elapsedRatio >= 0.75; // >= 75% elapsed (45s)

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full py-4 space-y-4 animate-fade select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-charades text-ink flex items-center justify-center font-bold shadow-sm">
            <Smile className="w-5 h-5 fill-ink" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Round {roundNo} of {totalRounds} •{' '}
              {isActor ? (
                <span className="text-primary">You are the Emoji Actor! 🎭</span>
              ) : (
                <span>
                  Actor:{' '}
                  <strong className="text-primary font-black">
                    {currentActor.profile?.display_name || 'Host'}
                  </strong>
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {isActor
                ? 'Describe the prompt using ONLY emojis. No letters or numbers!'
                : 'Guess what the emojis represent in the chat!'}
            </span>
          </div>
        </div>

        {/* Timer Badge */}
        <div className="flex items-center gap-2 text-xs font-heading font-black px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line shadow-tile-sm">
          <Clock className={`w-3.5 h-3.5 ${remainingSecs <= 10 ? 'text-danger animate-pulse' : 'text-primary'}`} />
          <span className="tabular-nums">{remainingSecs}s</span>
        </div>
      </div>

      {/* Secret Prompt (Actor) / Hints (Guessers) Banner */}
      <div className="p-3.5 rounded-card bg-surface-raised border border-line flex flex-col md:flex-row items-center justify-between gap-3 shadow-tile-sm">
        {isActor ? (
          <div className="flex-1 flex items-center justify-between w-full">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Your Secret Prompt
              </span>
              <div className="text-2xl font-black font-heading text-primary capitalize flex items-center gap-2">
                {currentPrompt.prompt}
                <span className="text-xs font-bold px-2 py-0.5 rounded-button bg-surface border border-line text-text-muted">
                  {currentPrompt.category}
                </span>
              </div>
            </div>

            {/* Skip Prompt Button (EMO-4) */}
            <Button
              variant="surface"
              onClick={handleSkipPrompt}
              disabled={skipCount >= 2}
              className="text-xs py-1.5 px-3 border-danger/40 text-danger hover:bg-danger/10"
              title="Skip prompt (-25 points)"
            >
              <SkipForward className="w-3.5 h-3.5 mr-1" />
              Skip (-25 pts) [{2 - skipCount} left]
            </Button>
          </div>
        ) : (
          <div className="flex-1 w-full flex items-center justify-between">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Prompt Clues & Hints
              </span>
              <div className="flex items-center gap-2 text-sm font-heading font-bold mt-0.5">
                {isHint1Active ? (
                  <span className="px-2 py-0.5 rounded-button bg-primary/20 text-ink border border-primary/40 font-black animate-fade">
                    💡 Category: {currentPrompt.category.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-text-muted flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5" /> Category hint in {Math.max(0, 30 - (ROUND_DURATION_SECS - remainingSecs))}s
                  </span>
                )}

                {isHint2Active && (
                  <span className="px-2 py-0.5 rounded-button bg-warn/20 text-ink border border-warn/40 font-black animate-fade">
                    ✨ {currentPrompt.prompt.length} letters, starts with &apos;{currentPrompt.prompt[0].toUpperCase()}&apos;
                  </span>
                )}
              </div>
            </div>

            <div className="text-xs font-mono font-bold text-text-muted">
              {currentPrompt.prompt.split(' ').length} word{currentPrompt.prompt.split(' ').length > 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Main Arena: Clue Display + Emoji Keyboard + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Live Emoji Clue Display + Picker */}
        <div className="lg:col-span-2 flex flex-col space-y-3">
          {/* Live Clue Display Surface */}
          <div className="w-full min-h-[140px] md:min-h-[160px] p-4 rounded-card bg-white border-2 border-line shadow-tile flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-text-muted font-heading font-bold">
              <span>Current Emoji Clue</span>
              <span>{Array.from(emojiClue).length} / {MAX_CLUE_EMOJIS} emojis</span>
            </div>

            <div className="py-2 text-center text-3xl md:text-5xl font-mono tracking-widest min-h-[50px] flex items-center justify-center break-all select-all">
              {emojiClue || (
                <span className="text-sm font-heading font-normal text-text-muted">
                  {isActor ? 'Tap emojis below to build your clue!' : 'Waiting for actor to send emojis…'}
                </span>
              )}
            </div>

            {/* Actor Controls Bar */}
            {isActor && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/50">
                <Button
                  variant="surface"
                  onClick={handleDeleteEmoji}
                  disabled={!emojiClue}
                  className="text-xs py-1 px-3 h-8"
                >
                  <Delete className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
                <Button
                  variant="surface"
                  onClick={handleClearAll}
                  disabled={!emojiClue}
                  className="text-xs py-1 px-3 h-8 border-danger/30 text-danger hover:bg-danger/10"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              </div>
            )}
          </div>

          {/* Actor Emoji Picker (EMO-1: Categorized Tabs + Recents) */}
          {isActor && (
            <div className="p-3 rounded-card bg-surface border-2 border-line shadow-tile-sm space-y-3">
              {/* Recents Row */}
              {recents.length > 0 && (
                <div className="flex items-center gap-1.5 pb-2 border-b border-line">
                  <span className="text-[10px] font-black uppercase text-text-muted tracking-wider mr-1">
                    Recents:
                  </span>
                  {recents.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddEmoji(emoji)}
                      className="w-8 h-8 rounded-[8px] bg-surface-raised hover:bg-surface border border-line flex items-center justify-center text-lg active:scale-90 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Category Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs font-heading font-black">
                {(Object.keys(EMOJI_CATEGORIES) as Array<keyof typeof EMOJI_CATEGORIES>).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    className={`px-3 py-1.5 rounded-button transition-colors whitespace-nowrap ${
                      activeTab === cat
                        ? 'bg-primary text-ink border border-line shadow-tile-sm'
                        : 'bg-surface-raised text-text-muted hover:text-text border border-transparent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Emoji Grid */}
              <div className="grid grid-cols-10 gap-1.5 p-1 bg-surface-raised rounded-card border border-line max-h-[180px] overflow-y-auto">
                {EMOJI_CATEGORIES[activeTab].map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAddEmoji(emoji)}
                    className="w-full aspect-square rounded-[8px] hover:bg-surface hover:shadow-sm border border-transparent hover:border-line flex items-center justify-center text-xl md:text-2xl active:scale-90 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Guesser Live Chat & Guessed Side-Channel (EMO-5) */}
        <div className="flex flex-col h-[380px] lg:h-auto rounded-card bg-surface border-2 border-line shadow-tile overflow-hidden">
          {/* Chat Header */}
          <div className="p-3 border-b border-line bg-surface-raised flex items-center justify-between text-xs font-black uppercase font-heading">
            <span className="text-text">Guesses & Chat</span>
            <span className="text-primary font-bold">
              {correctGuessers.length} / {Math.max(1, players.length - 1)} Guessed
            </span>
          </div>

          {/* Close feedback toast */}
          {closeFeedback && (
            <div className="p-2 bg-warn/20 border-b border-warn/40 text-xs font-black text-ink text-center animate-fade">
              ⚠️ {closeFeedback}
            </div>
          )}

          {/* Chat Messages Log */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-heading">
            {chatLog.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted text-center px-4">
                {isActor
                  ? 'Watch players guess your emojis!'
                  : 'Type your guesses below to score points!'}
              </div>
            ) : (
              chatLog.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2 rounded-[8px] ${
                    msg.isCorrect
                      ? 'bg-success/15 border border-success/30 text-success font-bold'
                      : msg.isClose
                      ? 'bg-warn/15 border border-warn/30 text-ink'
                      : 'bg-surface-raised border border-line text-text'
                  }`}
                >
                  <span className="font-black text-text-muted mr-1.5">{msg.sender}:</span>
                  <span>{msg.text}</span>
                </div>
              ))
            )}
          </div>

          {/* Rate limit warning */}
          {rateLimitWarning && (
            <span className="text-[10px] text-danger font-bold text-center py-1">
              Slow down! (800ms between guesses)
            </span>
          )}

          {/* Guess Input Form */}
          {!isActor && (
            <form
              onSubmit={handleSubmitGuess}
              className="p-2.5 border-t border-line bg-surface flex items-center gap-2"
            >
              {hasGuessedCorrectly ? (
                <div className="w-full py-2 px-3 rounded-button bg-success/15 border border-success/30 text-success font-heading font-black text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> You guessed the prompt!
                </div>
              ) : (
                <>
                  <Input
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder="Type your guess here…"
                    className="text-xs h-9"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!guessInput.trim()}
                    className="h-9 px-3"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
