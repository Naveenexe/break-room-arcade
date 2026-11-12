import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sound } from '@/lib/sound';
import { timeSync } from '@/lib/time-sync';
import { computeGuesserScore, computeDrawerScore, evaluateGuess } from '@/lib/scoring';
import { SEED_PICTIONARY } from '@/data/seed-content';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { Palette, Eraser, Trash2, Send, Clock } from 'lucide-react';

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

interface PictionaryProps {
  room: Room;
  players: PlayerWithProfile[];
  userId: string;
  isHost: boolean;
  onFinishGame: (finalScores: { [userId: string]: number }) => void;
}

const PALETTE = [
  '#F7F4FF', // White
  '#1E1B3A', // Dark Plum
  '#FF5FA2', // Bubblegum Pink
  '#FF8A3D', // Tangerine
  '#FFD23F', // Sunshine Yellow
  '#3DDBB0', // Mint Green
  '#4DB5FF', // Sky Blue
  '#A47BFF', // Grape Purple
];

export const Pictionary: React.FC<PictionaryProps> = ({
  room,
  players,
  userId,
  isHost,
  onFinishGame,
}) => {
  const [drawerIndex, setDrawerIndex] = useState(0);
  const currentDrawer = players[drawerIndex] || players[0];
  const isDrawer = currentDrawer.user_id === userId;

  // Words to choose from
  const [wordChoices] = useState<string[]>(() => {
    const shuffled = [...SEED_PICTIONARY].sort(() => 0.5 - Math.random());
    return [shuffled[0].word, shuffled[1].word, shuffled[2].word];
  });
  const [secretWord, setSecretWord] = useState<string>('');
  const [isWordChosen, setIsWordChosen] = useState(false);

  // Drawing tools
  const [selectedColor, setSelectedColor] = useState('#FF8A3D');
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  // Guessing
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState<{ sender: string; text: string; isCorrect?: boolean; isClose?: boolean }[]>([]);
  const [correctGuessers, setCorrectGuessers] = useState<string[]>([]);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(80);
  const [cumulativeScores, setCumulativeScores] = useState<{ [uid: string]: number }>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const roundStartRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<number | null>(null);

  // Realtime Broadcast for Canvas Strokes and Guesses
  useEffect(() => {
    const channel = supabase.channel(`pictionary:${room.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'draw_stroke' }, ({ payload }) => {
        setStrokes((prev) => [...prev, payload]);
      })
      .on('broadcast', { event: 'clear_canvas' }, () => {
        setStrokes([]);
      })
      .on('broadcast', { event: 'word_chosen' }, ({ payload }) => {
        setSecretWord(payload.word);
        setIsWordChosen(true);
        roundStartRef.current = payload.startTime;
      })
      .on('broadcast', { event: 'advance_drawer' }, ({ payload }) => {
        setDrawerIndex(payload.nextDrawerIndex);
        setIsWordChosen(false);
        setSecretWord('');
        setStrokes([]);
        setCorrectGuessers([]);
        setHasGuessedCorrectly(false);
      })
      .on('broadcast', { event: 'pictionary_finished' }, ({ payload }) => {
        onFinishGame(payload.finalScores);
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

  // Redraw canvas whenever strokes change
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
      ctx.strokeStyle = stroke.isEraser ? '#2A2650' : stroke.color;
      ctx.lineWidth = stroke.size;

      const p0 = stroke.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      }
      ctx.stroke();
    });
  }, [strokes, currentStroke]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Choose secret word
  const chooseWord = async (word: string) => {
    setSecretWord(word);
    setIsWordChosen(true);
    const start = timeSync.correctedNow();
    roundStartRef.current = start;

    const channel = supabase.channel(`pictionary:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'word_chosen',
      payload: { word, startTime: start },
    });

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      const elapsed = Math.round((timeSync.correctedNow() - roundStartRef.current) / 1000);
      const left = Math.max(0, 80 - elapsed);
      setRemainingSecs(left);
      if (left <= 5 && left > 0) sound.playTick();
      if (left === 0) endRound();
    }, 1000);
  };

  // Canvas Drawing Handlers (PIC-2, PIC-4: touch-action: none)
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer || !isWordChosen) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    isDrawingRef.current = true;
    setCurrentStroke({
      points: [pt],
      color: selectedColor,
      size: brushSize,
      isEraser,
    });
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer || !isDrawingRef.current || !currentStroke) return;
    const pt = getCoordinates(e);
    if (!pt) return;

    setCurrentStroke((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, pt],
      };
    });
  };

  const handlePointerUp = async () => {
    if (!isDrawer || !isDrawingRef.current || !currentStroke) return;
    isDrawingRef.current = false;

    setStrokes((prev) => [...prev, currentStroke]);

    // Broadcast stroke batch
    const channel = supabase.channel(`pictionary:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'draw_stroke',
      payload: currentStroke,
    });

    setCurrentStroke(null);
  };

  const handleClear = async () => {
    if (!isDrawer) return;
    setStrokes([]);
    const channel = supabase.channel(`pictionary:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'clear_canvas',
      payload: {},
    });
  };

  // Submit Guess (PIC-6, PIC-7)
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guessInput.trim();
    if (!clean || hasGuessedCorrectly || isDrawer) return;

    setGuessInput('');
    const evaluation = evaluateGuess(clean, secretWord);

    const senderName = players.find((p) => p.user_id === userId)?.profile?.display_name || 'Player';

    if (evaluation === 'correct') {
      setHasGuessedCorrectly(true);
      const isFirst = correctGuessers.length === 0;
      const score = computeGuesserScore({
        remainingTimeMs: remainingSecs * 1000,
        totalTimeMs: 80000,
        isFirstCorrect: isFirst,
      });

      setCumulativeScores((prev) => ({
        ...prev,
        [userId]: (prev[userId] || 0) + score,
      }));

      const msg = {
        sender: senderName,
        text: 'Guessed the word correctly! 🎉',
        isCorrect: true,
        userId,
      };

      setChatLog((prev) => [...prev, msg]);
      setCorrectGuessers((prev) => [...prev, userId]);
      sound.playCorrect();

      const channel = supabase.channel(`pictionary:${room.id}`);
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

      const channel = supabase.channel(`pictionary:${room.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'guess_message',
        payload: msg,
      });
    }
  };

  const endRound = async () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Compute drawer score (PIC-8)
    const guessersCount = correctGuessers.length;
    const allGuessed = guessersCount >= players.length - 1;
    const drawerScore = computeDrawerScore(guessersCount, allGuessed);

    const updatedScores = {
      ...cumulativeScores,
      [currentDrawer.user_id]: (cumulativeScores[currentDrawer.user_id] || 0) + drawerScore,
    };
    setCumulativeScores(updatedScores);

    const channel = supabase.channel(`pictionary:${room.id}`);

    if (drawerIndex < players.length - 1) {
      await channel.send({
        type: 'broadcast',
        event: 'advance_drawer',
        payload: { nextDrawerIndex: drawerIndex + 1 },
      });
      setDrawerIndex((idx) => idx + 1);
      setIsWordChosen(false);
      setSecretWord('');
      setStrokes([]);
      setCorrectGuessers([]);
      setHasGuessedCorrectly(false);
    } else {
      await channel.send({
        type: 'broadcast',
        event: 'pictionary_finished',
        payload: { finalScores: updatedScores },
      });
      onFinishGame(updatedScores);
    }
  };

  // Masked word hint (PIC-5)
  const getMaskedWord = () => {
    if (!secretWord) return 'WAITING FOR WORD…';
    if (isDrawer || hasGuessedCorrectly) return secretWord.toUpperCase();

    // Reveal 1 letter at 50% time, 2 at 75%
    const revealCount = remainingSecs <= 20 ? 2 : remainingSecs <= 40 ? 1 : 0;

    return secretWord
      .split('')
      .map((char, i) => {
        if (char === ' ') return '  ';
        if (i < revealCount) return char.toUpperCase();
        return '_';
      })
      .join(' ');
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full py-2 space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-game-pictionary" />
          <span className="font-heading font-bold text-lg text-text">Pictionary</span>
          <span className="text-xs text-text-muted">
            • Drawer: <strong>{currentDrawer.profile?.display_name || 'Player'}</strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="font-heading font-bold tracking-widest text-lg text-warn">
            {getMaskedWord()}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-line text-sm font-heading font-black">
            <Clock className="w-4 h-4 text-warn" />
            <span className={remainingSecs <= 10 ? 'text-danger animate-pulse' : 'text-text'}>
              {remainingSecs}s
            </span>
          </div>
        </div>
      </div>

      {/* Word Selection Overlay for Drawer (PIC-1) */}
      {isDrawer && !isWordChosen && (
        <div className="p-6 bg-surface rounded-card border-2 border-primary text-center space-y-4 shadow-2xl">
          <h2 className="text-xl font-black font-heading text-primary">Pick a Word to Draw (12s)</h2>
          <div className="flex justify-center gap-3 flex-wrap">
            {wordChoices.map((w) => (
              <Button key={w} variant="secondary" size="lg" onClick={() => chooseWord(w)}>
                {w}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Left = Canvas + Tools, Right = Live Chat / Guesses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Drawing Canvas Area */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          <div className="relative w-full aspect-[4/3] bg-surface rounded-card border-2 border-line overflow-hidden shadow-xl">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              className="w-full h-full touch-none cursor-crosshair"
            />
          </div>

          {/* Drawer Toolbar (PIC-2) */}
          {isDrawer && (
            <div className="flex items-center justify-between p-2.5 bg-surface rounded-full border-2 border-line">
              <div className="flex items-center gap-1.5">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color);
                      setIsEraser(false);
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      selectedColor === color && !isEraser ? 'scale-110 border-text' : 'border-line'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-full border border-line">
                  {[2, 4, 8].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setBrushSize(size)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        brushSize === size ? 'bg-primary text-bg' : 'text-text'
                      }`}
                    >
                      {size === 2 ? 'S' : size === 4 ? 'M' : 'L'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsEraser(!isEraser)}
                  className={`p-2 rounded-full border ${isEraser ? 'bg-primary text-bg' : 'bg-surface text-text'}`}
                  title="Eraser"
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-2 rounded-full border border-line hover:text-danger"
                  title="Clear Canvas"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chat / Guesses Area (PIC-6, PIC-7) */}
        <div className="lg:col-span-4 bg-surface rounded-card border-2 border-line flex flex-col justify-between p-4 shadow-xl h-[420px]">
          <div>
            <span className="text-xs uppercase font-bold text-text-muted pb-2 border-b border-line block">
              Guesses & Announcements
            </span>

            <div className="space-y-2 mt-3 max-h-[290px] overflow-y-auto pr-1">
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

          {/* Guess Input */}
          {!isDrawer && (
            <form onSubmit={handleSubmitGuess} className="flex gap-2 pt-2 border-t border-line">
              <Input
                placeholder={hasGuessedCorrectly ? 'You got it!' : 'Type your guess…'}
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

      {/* Host Controls */}
      {isHost && (
        <div className="flex justify-end pt-2">
          <Button variant="surface" size="sm" onClick={endRound}>
            Next Drawer / Finish
          </Button>
        </div>
      )}
    </div>
  );
};
