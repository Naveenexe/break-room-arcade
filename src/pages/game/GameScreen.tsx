import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Podium, PodiumPlayer } from '@/components/ui/Podium';
import { ReactionDuel } from '@/games/ReactionDuel';
import { TypingRace } from '@/games/TypingRace';
import { QuickDrawQuiz } from '@/games/QuickDrawQuiz';
import { Pictionary } from '@/games/Pictionary';
import { EmojiCharades } from '@/games/EmojiCharades';
import { WordChainBlitz } from '@/games/WordChainBlitz';
import { sound } from '@/lib/sound';
import { computeArcadePoints } from '@/lib/scoring';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import { FastForward, XSquare, MoreVertical } from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

export const GameScreen: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPodium, setIsPodium] = useState<boolean>(false);
  const [podiumPlayers, setPodiumPlayers] = useState<PodiumPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHostMenu, setShowHostMenu] = useState(false);

  const advancingRef = useRef(false);

  // Fetch full room and player state (E-13: Rebuild screen from database)
  const fetchRoomState = useCallback(async () => {
    if (!code || !isSupabaseConfigured) return;

    try {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

      if (roomData) {
        setRoom(roomData);

        if (roomData.phase === 'podium' || roomData.status === 'ended') {
          setIsPodium(true);
        }

        const { data: playersData } = await supabase
          .from('room_players')
          .select('*, profile:profiles(*)')
          .eq('room_id', roomData.id);

        if (playersData) {
          setPlayers(playersData as unknown as PlayerWithProfile[]);
        }
      }
      setIsLoading(false);
    } catch (err) {
      console.error('fetchRoomState error:', err);
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchRoomState();
  }, [fetchRoomState]);

  // Realtime subscription on room changes and player presence
  useEffect(() => {
    if (!code || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`game_realtime:${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as Room;
            if (updated.code === code.toUpperCase()) {
              setRoom(updated);
              if (updated.phase === 'podium' || updated.status === 'ended') {
                setIsPodium(true);
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players' },
        () => {
          fetchRoomState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, fetchRoomState]);

  // E-14: Heartbeat every 10 seconds
  useEffect(() => {
    if (!room?.id || !user) return;

    const interval = window.setInterval(async () => {
      try {
        await supabase.rpc('heartbeat', { p_room_id: room.id });
      } catch {
        // Ignore heartbeat network glitches
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [room?.id, user]);

  // Advance Phase Caller (E-2, E-3: Idempotent with jitter delay)
  const triggerAdvancePhase = useCallback(
    async (delayMs: number = 0) => {
      if (!room || advancingRef.current) return;

      window.setTimeout(async () => {
        advancingRef.current = true;
        try {
          await supabase.rpc('advance_phase', {
            p_room_id: room.id,
            p_expected_version: room.version,
          });
        } catch {
          // If collision or lock conflict, watchdog will recover
        } finally {
          advancingRef.current = false;
        }
      }, delayMs);
    },
    [room]
  );

  // E-5: Watchdog and Phase Timer Progression
  useEffect(() => {
    if (!room || !room.phase_ends_at || room.phase === 'podium' || room.status === 'ended') {
      return;
    }

    const interval = window.setInterval(() => {
      const endsAtMs = new Date(room.phase_ends_at!).getTime();
      const nowMs = Date.now();

      // Normal expiration: trigger with random jitter 200ms - 800ms (E-3)
      if (nowMs >= endsAtMs && nowMs < endsAtMs + 3000) {
        const jitter = Math.floor(Math.random() * 600) + 200;
        triggerAdvancePhase(jitter);
      }

      // E-5 Watchdog: if phase is more than 5s overdue and still unchanged, retry every 2s
      if (nowMs >= endsAtMs + 5000) {
        triggerAdvancePhase(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room, triggerAdvancePhase]);

  // Initial 3-2-1 Countdown
  useEffect(() => {
    if (!room || room.phase !== 'countdown') return;

    let count = 3;
    setCountdown(count);
    sound.playTick();

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        sound.playTick();
      } else {
        clearInterval(interval);
        setCountdown(null);
        sound.playGo();
        triggerAdvancePhase(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room?.phase]);

  // HC-3: Host Skip Phase
  const handleHostSkip = async () => {
    if (!room || user?.id !== room.host_id) return;
    try {
      await supabase.rpc('skip_phase', { p_room_id: room.id });
    } catch (err) {
      console.error('Skip failed:', err);
    }
  };

  // HC-3: Host End Game Early
  const handleHostEndGame = async () => {
    if (!room || user?.id !== room.host_id) return;
    try {
      await supabase.rpc('end_game', { p_room_id: room.id });
      setIsPodium(true);
    } catch (err) {
      console.error('End game failed:', err);
    }
  };

  // Handle Game Completion -> Show Podium with Arcade Points
  const handleFinishGame = async (gameScores: { [userId: string]: number }) => {
    setIsPodium(true);

    const standings = players.map((p) => ({
      userId: p.user_id,
      rawScore: gameScores[p.user_id] || 0,
      isSpectator: p.is_spectator,
      hasParticipated: true,
    }));

    const arcadeAwards = computeArcadePoints(standings);

    const updatedPodiumList: PodiumPlayer[] = players.map((p) => {
      const matchScore = gameScores[p.user_id] || 0;
      const award = arcadeAwards.find((a) => a.userId === p.user_id);
      const arcadePts = award?.arcadePoints || 0;

      return {
        userId: p.user_id,
        displayName: p.profile?.display_name || 'Player',
        avatarId: p.profile?.avatar_id || 'avatar-01',
        gameScore: matchScore,
        totalScore: (p.total_score || 0) + arcadePts,
        rank: award?.rank || 0,
      };
    });

    updatedPodiumList.sort((a, b) => b.totalScore - a.totalScore);
    setPodiumPlayers(updatedPodiumList);
  };

  const handlePlayAgain = () => {
    setIsPodium(false);
    navigate(`/room/${code}`);
  };

  const handleBackToLobby = () => {
    navigate(`/room/${code}`);
  };

  if (isLoading || !room || !user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // 3-2-1 Countdown Overlay
  if (countdown !== null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center hero-spotlight">
        <div className="text-center space-y-4">
          <span className="text-xs uppercase font-bold tracking-widest text-primary">
            Starting Game
          </span>
          <div className="text-8xl md:text-9xl font-black font-heading text-primary animate-ping">
            {countdown}
          </div>
          <h2 className="text-2xl font-black font-heading text-text">
            {room.current_game?.toUpperCase() || 'GET READY'}
          </h2>
        </div>
      </div>
    );
  }

  // Podium View (FR-ROOM-9, E-24, E-25)
  if (isPodium || room.phase === 'podium' || room.status === 'ended') {
    const activePodium =
      podiumPlayers.length > 0
        ? podiumPlayers
        : players
            .map((p) => ({
              userId: p.user_id,
              displayName: p.profile?.display_name || 'Player',
              avatarId: p.profile?.avatar_id || 'avatar-01',
              gameScore: 0,
              totalScore: p.total_score || 0,
              rank: 1,
            }))
            .sort((a, b) => b.totalScore - a.totalScore);

    return (
      <Podium
        players={activePodium}
        gameTitle={room.current_game || 'Arcade Match'}
        isHost={user.id === room.host_id}
        onPlayAgain={handlePlayAgain}
        onPickAnotherGame={handleBackToLobby}
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  const isHost = user.id === room.host_id;
  const activeGame = room.current_game || 'quiz';

  return (
    <div className="flex-1 flex flex-col relative">
      {/* HC-3: Host in-game controls overflow menu */}
      {isHost && (
        <div className="absolute top-2 right-4 z-50">
          <button
            onClick={() => setShowHostMenu(!showHostMenu)}
            className="p-2 rounded-lg bg-surface border border-line text-text hover:bg-surface-raised transition-colors"
            title="Host Controls"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showHostMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-raised rounded-xl border border-line shadow-2xl py-2 space-y-1">
              <button
                onClick={() => {
                  handleHostSkip();
                  setShowHostMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-text hover:bg-primary/20 flex items-center gap-2"
              >
                <FastForward className="w-4 h-4 text-warn" />
                Skip Current Phase
              </button>
              <button
                onClick={() => {
                  handleHostEndGame();
                  setShowHostMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger/20 flex items-center gap-2"
              >
                <XSquare className="w-4 h-4" />
                End Game Early
              </button>
            </div>
          )}
        </div>
      )}

      {/* Game Components */}
      {activeGame === 'reaction' && (
        <ReactionDuel
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}

      {activeGame === 'typing' && (
        <TypingRace
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}

      {activeGame === 'quiz' && (
        <QuickDrawQuiz
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}

      {activeGame === 'pictionary' && (
        <Pictionary
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}

      {activeGame === 'charades' && (
        <EmojiCharades
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}

      {activeGame === 'wordchain' && (
        <WordChainBlitz
          room={room}
          players={players}
          userId={user.id}
          isHost={isHost}
          onFinishGame={handleFinishGame}
        />
      )}
    </div>
  );
};
