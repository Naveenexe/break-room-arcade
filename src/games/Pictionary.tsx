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
import { SEED_PICTIONARY } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import {
  Palette,
  Eraser,
  Trash2,
  Undo2,
  Send,
  Clock,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

interface StrokePoint {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
}

interface Stroke {
  points: StrokePoint[];
  color: string;
  size: number;
  isEraser: boolean;
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

interface PictionaryProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

// PIC-2: 8-color v2 palette matching "Golden hour on rooftop"
export const PICTIONARY_PALETTE = [
  '#1B1917', // Ink / Charcoal
  '#FFFFFF', // White
  '#FF5C35', // Coral
  '#00D26A', // Mint
  '#FFC01D', // Sun
  '#3B82F6', // Sky
  '#8B5CF6', // Lavender
  '#D97706', // Ochre
];

// PIC-2: 3 brush sizes
export const BRUSH_SIZES = [
  { label: 'S', size: 3 },
  { label: 'M', size: 7 },
  { label: 'L', size: 14 },
];

export const ROUND_DURATION_SECS = 75; // PIC-8

/**
 * Generates masked clue word with underscores and automated hints
 * Hint 1 (>=40% elapsed): first letter of each word
 * Hint 2 (>=70% elapsed): 1 random additional letter per word
 */
export function getMaskedClue(
  word: string,
  elapsedSecs: number,
  totalSecs: number = ROUND_DURATION_SECS,
  seed: number = 42
): string {
  if (!word) return '';
  const words = word.split(' ');
  const elapsedRatio = elapsedSecs / totalSecs;

  const hint1Active = elapsedRatio >= 0.4;
  const hint2Active = elapsedRatio >= 0.7;

  return words
    .map((w, wIdx) => {
      const letters = w.split('');
      const revealedIndices = new Set<number>();

      if (hint1Active && letters.length > 0) {
        revealedIndices.add(0);
      }

      if (hint2Active && letters.length > 2) {
        // Deterministic pseudo-random second letter based on word index & seed
        const secondIdx = 1 + ((seed + wIdx * 3) % (letters.length - 1));
        revealedIndices.add(secondIdx);
      }

      return letters
        .map((char, cIdx) => (revealedIndices.has(cIdx) ? char.toUpperCase() : '_'))
        .join(' ');
    })
    .join('    '); // Wider space between words
}

export const Pictionary: React.FC<PictionaryProps> = ({
  room,
  players,
  userId,
  onFinishGame,
}) => {
  const gameState = room.game_state || {};
  const roundNo = Math.max(1, (gameState.round as number) || 1);
  const totalRounds = players.length; // Each player draws once

  // Current drawer rotates each round
  const drawerIndex = (roundNo - 1) % players.length;
  const currentDrawer = players[drawerIndex] || players[0];
  const isDrawer = currentDrawer.user_id === userId;

  // Words to choose from (Easy, Medium, Hard) tiered from dictionary (PIC-4)
  const [wordChoices, setWordChoices] = useState<{ word: string; difficulty: 1 | 2 | 3 }[]>([]);
  const [secretWord, setSecretWord] = useState<string>('');
  const [isWordChosen, setIsWordChosen] = useState(false);
  const [choiceCountdown, setChoiceCountdown] = useState(10);

  // Drawing tools (PIC-2)
  const [selectedColor, setSelectedColor] = useState(PICTIONARY_PALETTE[0]);
  const [brushSize, setBrushSize] = useState(7); // default Medium
  const [isEraser, setIsEraser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  // Guessing state
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const pendingPointsRef = useRef<StrokePoint[]>([]);
  const batchSeqRef = useRef<number>(0);
  const roundStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<number | null>(null);

  // 1. Initialize Word Choices for Drawer (PIC-4)
  useEffect(() => {
    const easy = SEED_PICTIONARY.filter((p) => p.difficulty === 1);
    const medium = SEED_PICTIONARY.filter((p) => p.difficulty === 2);
    const hard = SEED_PICTIONARY.filter((p) => p.difficulty === 3);

    const pickRandom = (arr: typeof SEED_PICTIONARY) =>
      arr[Math.floor(Math.random() * arr.length)];

    const choices = [
      pickRandom(easy) || SEED_PICTIONARY[0],
      pickRandom(medium) || SEED_PICTIONARY[1],
      pickRandom(hard) || SEED_PICTIONARY[2],
    ];

    setWordChoices(choices);
    setIsWordChosen(false);
    setSecretWord('');
    setChoiceCountdown(10);
    setStrokes([]);
    setCorrectGuessers([]);
    setHasGuessedCorrectly(false);
    setCloseFeedback(null);
  }, [roundNo]);

  // Drawer 10s Auto-pick Watchdog (PIC-4 & PIC-9)
  useEffect(() => {
    if (!isDrawer || isWordChosen || wordChoices.length === 0) return;

    const interval = window.setInterval(() => {
      setChoiceCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto-pick Medium difficulty word (index 1)
          handleSelectWord(wordChoices[1].word);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDrawer, isWordChosen, wordChoices]);

  // Handle Word Choice Selection
  const handleSelectWord = useCallback(
    async (word: string) => {
      setSecretWord(word);
      setIsWordChosen(true);
      roundStartRef.current = Date.now();
      setRemainingSecs(ROUND_DURATION_SECS);

      // Attempt authoritative save to round_secrets
      try {
        await supabase.rpc('choose_word', {
          p_room_id: room.id,
          p_round_no: roundNo,
          p_word: word,
        });
      } catch {
        // Fallback handled via broadcast
      }

      // Broadcast word selection to peers (secret word hidden from guessers)
      const channel = supabase.channel(`pictionary:${room.id}`);
      channel.send({
        type: 'broadcast',
        event: 'word_selected',
        payload: {
          wordLength: word.length,
          wordMask: getMaskedClue(word, 0),
          startTime: Date.now(),
        },
      });
    },
    [room.id, roundNo]
  );

  // Round Timer Countdown (75s per turn - PIC-8)
  useEffect(() => {
    if (!isWordChosen) return;

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
  }, [isWordChosen]);

  // Handle End of Round (Time Up or All Guessed)
  const handleRoundTimeout = useCallback(() => {
    sound.playApplause();

    // Calculate drawer points
    const nonDrawersCount = Math.max(1, players.length - 1);
    const allGuessed = correctGuessers.length === nonDrawersCount;
    const drawerPts = computeDrawerScore(correctGuessers.length, allGuessed);

    setCumulativeScores((prev) => {
      const updated = {
        ...prev,
        [currentDrawer.user_id]: (prev[currentDrawer.user_id] || 0) + drawerPts,
      };

      if (roundNo >= totalRounds) {
        onFinishGame(updated);
      }
      return updated;
    });
  }, [players.length, correctGuessers.length, currentDrawer.user_id, roundNo, totalRounds, onFinishGame]);

  // Realtime Broadcast Channel Listener (PIC-3)
  useEffect(() => {
    const channel = supabase.channel(`pictionary:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'draw_batch' }, ({ payload }) => {
        setStrokes((prev) => [...prev, payload.stroke]);
      })
      .on('broadcast', { event: 'clear_canvas' }, () => {
        setStrokes([]);
      })
      .on('broadcast', { event: 'undo_stroke' }, () => {
        setStrokes((prev) => prev.slice(0, -1));
      })
      .on('broadcast', { event: 'word_selected' }, ({ payload }) => {
        setIsWordChosen(true);
        roundStartRef.current = payload.startTime;
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

  // Canvas Redraw Loop on Stroke Changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    allStrokes.forEach((stroke) => {
      if (stroke.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? '#FFFFFF' : stroke.color;
      ctx.lineWidth = stroke.size;

      const p0 = stroke.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);

      if (stroke.points.length === 1) {
        ctx.lineTo(p0.x * canvas.width + 0.1, p0.y * canvas.height + 0.1);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
        }
      }
      ctx.stroke();
    });
  }, [strokes, currentStroke]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Mouse / Touch Event Handlers (PIC-1: Normalized 0..1 coordinates)
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return null;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer || !isWordChosen) return;
    isDrawingRef.current = true;
    const pt = getCoordinates(e);
    if (!pt) return;

    const newStroke: Stroke = {
      points: [pt],
      color: selectedColor,
      size: brushSize,
      isEraser,
    };
    setCurrentStroke(newStroke);
    pendingPointsRef.current = [pt];
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer || !isDrawingRef.current || !currentStroke) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    setCurrentStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
    pendingPointsRef.current.push(pt);
  };

  const endDrawing = () => {
    if (!isDrawer || !isDrawingRef.current || !currentStroke) return;
    isDrawingRef.current = false;

    const finishedStroke = currentStroke;
    setStrokes((prev) => [...prev, finishedStroke]);
    setCurrentStroke(null);

    // Broadcast stroke to peers
    const channel = supabase.channel(`pictionary:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'draw_batch',
      payload: { stroke: finishedStroke },
    });

    // Save stroke to round_strokes table (PIC-3)
    batchSeqRef.current += 1;
    void (async () => {
      try {
        await supabase.rpc('save_strokes', {
          p_room_id: room.id,
          p_round_no: roundNo,
          p_batch_seq: batchSeqRef.current,
          p_strokes: finishedStroke,
        });
      } catch {
        // Fallback to broadcast
      }
    })();
  };

  // Undo Last Stroke (PIC-2)
  const handleUndo = () => {
    if (!isDrawer || strokes.length === 0) return;
    setStrokes((prev) => prev.slice(0, -1));
    const channel = supabase.channel(`pictionary:${room.id}`);
    channel.send({ type: 'broadcast', event: 'undo_stroke' });
  };

  // Clear Canvas (PIC-2)
  const handleClear = () => {
    if (!isDrawer) return;
    setStrokes([]);
    const channel = supabase.channel(`pictionary:${room.id}`);
    channel.send({ type: 'broadcast', event: 'clear_canvas' });
  };

  // Guess Submission Flow (PIC-5 & PIC-6)
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guessInput.trim();
    if (!trimmed || isDrawer || hasGuessedCorrectly) return;

    // PIC-5: Rate limit 1 guess per 800ms
    const now = Date.now();
    if (now - lastGuessTime < 800) {
      setRateLimitWarning(true);
      setTimeout(() => setRateLimitWarning(false), 800);
      return;
    }
    setLastGuessTime(now);

    const userProfile = players.find((p) => p.user_id === userId)?.profile;
    const senderName = userProfile?.display_name || 'Player';

    // Local evaluation against secretWord if available, or fallback
    let isCorrect = false;
    let isClose = false;

    if (secretWord) {
      const evaluation = evaluateGuess(trimmed, secretWord);
      isCorrect = evaluation === 'correct';
      isClose = evaluation === 'close';
    }

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
      setCloseFeedback(`" ${trimmed} " is so close! Keep trying!`);
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

      // Check if all non-drawers have guessed
      const nonDrawersCount = Math.max(1, players.length - 1);
      if (newGuessers.length >= nonDrawersCount) {
        handleRoundTimeout();
      }
    }

    // Broadcast chat message
    const chatMsg: ChatMessage = {
      id: Math.random().toString(),
      userId,
      sender: senderName,
      text: isCorrect ? 'Guessed the word! 🎉' : trimmed,
      isCorrect,
      isClose,
      timestamp: Date.now(),
    };

    setChatLog((prev) => [...prev, chatMsg]);

    const channel = supabase.channel(`pictionary:${room.id}`);
    channel.send({
      type: 'broadcast',
      event: 'guess_received',
      payload: chatMsg,
    });

    setGuessInput('');
  };

  const elapsedSecs = ROUND_DURATION_SECS - remainingSecs;
  const clueMask = getMaskedClue(secretWord, elapsedSecs);

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full py-4 space-y-4 animate-fade select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-3.5 rounded-card bg-surface border-2 border-line shadow-tile">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-game-pictionary text-ink flex items-center justify-center font-bold shadow-sm">
            <Palette className="w-5 h-5 fill-ink" />
          </div>
          <div>
            <span className="font-heading font-black text-sm md:text-base text-text flex items-center gap-2">
              Round {roundNo} of {totalRounds} •{' '}
              {isDrawer ? (
                <span className="text-primary">You are Drawing! 🎨</span>
              ) : (
                <span>
                  Drawer:{' '}
                  <strong className="text-primary font-black">
                    {currentDrawer.profile?.display_name || 'Host'}
                  </strong>
                </span>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {isDrawer
                ? 'Draw the secret word. No letters or numbers!'
                : 'Guess the drawing in the chat box!'}
            </span>
          </div>
        </div>

        {/* Timer Badge */}
        <div className="flex items-center gap-2 text-xs font-heading font-black px-3 py-1.5 rounded-[10px] bg-surface-raised border border-line shadow-tile-sm">
          <Clock className={`w-3.5 h-3.5 ${remainingSecs <= 15 ? 'text-danger animate-pulse' : 'text-primary'}`} />
          <span className="tabular-nums">{remainingSecs}s</span>
        </div>
      </div>

      {/* Drawer Word Selection Overlay (PIC-4) */}
      {isDrawer && !isWordChosen && (
        <div className="tile p-6 bg-surface-raised border-2 border-primary space-y-4 text-center animate-fade">
          <span className="text-xs font-black uppercase tracking-widest text-primary">
            Choose Your Word ({choiceCountdown}s)
          </span>
          <h2 className="text-2xl font-black font-heading text-text">
            What will you draw?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-lg mx-auto">
            {wordChoices.map((choice) => (
              <Button
                key={choice.word}
                variant="primary"
                onClick={() => handleSelectWord(choice.word)}
                className="py-4 flex flex-col items-center gap-1 capitalize"
              >
                <span className="text-base font-black">{choice.word}</span>
                <span className="text-[10px] uppercase font-bold text-ink/70">
                  {choice.difficulty === 1 ? '⭐ Easy' : choice.difficulty === 2 ? '⭐⭐ Medium' : '⭐⭐⭐ Hard'}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Guesser Waiting for Word Overlay */}
      {!isDrawer && !isWordChosen && (
        <div className="tile p-8 bg-surface-raised text-center space-y-2 animate-fade">
          <HelpCircle className="w-8 h-8 text-warn mx-auto animate-bounce" />
          <h3 className="text-lg font-black font-heading text-text">
            {currentDrawer.profile?.display_name || 'Drawer'} is choosing a word…
          </h3>
          <p className="text-xs text-text-muted font-heading">
            Get your fingers ready to guess!
          </p>
        </div>
      )}

      {/* Secret Word / Clue Banner */}
      {isWordChosen && (
        <div className="p-3 rounded-card bg-surface-raised border border-line flex items-center justify-between text-center px-6">
          <div className="w-full">
            {isDrawer ? (
              <div className="space-y-0.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                  Your Secret Word
                </span>
                <div className="text-2xl font-black font-heading text-primary uppercase tracking-wide">
                  {secretWord}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                  Word Clue ({secretWord.length || clueMask.replace(/\s+/g, '').length} Letters)
                </span>
                <div className="text-xl md:text-2xl font-mono font-black text-text tracking-widest">
                  {clueMask}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Game Arena: 3:2 Canvas + Chat Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Drawing Canvas Area (PIC-1: Fixed 3:2 aspect ratio) */}
        <div className="lg:col-span-2 flex flex-col space-y-3">
          <div className="relative w-full aspect-[3/2] bg-white rounded-card border-2 border-line shadow-tile overflow-hidden cursor-crosshair">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={endDrawing}
              className="w-full h-full touch-none"
            />
          </div>

          {/* Drawer Toolbar (PIC-2: Palette, Sizes, Undo, Clear) */}
          {isDrawer && isWordChosen && (
            <div className="p-2.5 rounded-card bg-surface border border-line flex flex-wrap items-center justify-between gap-2 shadow-tile-sm">
              {/* Color Swatches */}
              <div className="flex items-center gap-1.5">
                {PICTIONARY_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setSelectedColor(color);
                      setIsEraser(false);
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      selectedColor === color && !isEraser
                        ? 'border-ink scale-110 shadow-md ring-2 ring-primary'
                        : 'border-line hover:scale-105'
                    }`}
                  />
                ))}
              </div>

              {/* Brush Sizes */}
              <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-button border border-line">
                {BRUSH_SIZES.map((b) => (
                  <button
                    key={b.size}
                    onClick={() => setBrushSize(b.size)}
                    className={`w-6 h-6 rounded font-heading font-black text-xs ${
                      brushSize === b.size
                        ? 'bg-primary text-ink'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsEraser(!isEraser)}
                  className={`p-1.5 rounded-button border text-xs font-bold flex items-center gap-1 ${
                    isEraser
                      ? 'bg-ink text-white border-ink'
                      : 'bg-surface-raised border-line text-text hover:bg-surface'
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button
                  onClick={handleUndo}
                  className="p-1.5 rounded-button bg-surface-raised border border-line text-text hover:bg-surface text-xs font-bold"
                  title="Undo last stroke"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-button bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 text-xs font-bold"
                  title="Clear canvas"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Guesser Live Chat & Guessed Side-Channel (PIC-5) */}
        <div className="flex flex-col h-[400px] lg:h-auto rounded-card bg-surface border-2 border-line shadow-tile overflow-hidden">
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
                {isDrawer
                  ? 'Watch guesses roll in here!'
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
          {!isDrawer && (
            <form
              onSubmit={handleSubmitGuess}
              className="p-2.5 border-t border-line bg-surface flex items-center gap-2"
            >
              {hasGuessedCorrectly ? (
                <div className="w-full py-2 px-3 rounded-button bg-success/15 border border-success/30 text-success font-heading font-black text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> You guessed the word!
                </div>
              ) : (
                <>
                  <Input
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder="Type your guess here…"
                    className="text-xs h-9"
                    disabled={!isWordChosen}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!guessInput.trim() || !isWordChosen}
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
