import React, { useEffect, useState, useCallback } from 'react';
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
import type { Room, RoomPlayer, Profile } from '@/types/database';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

export const GameScreen: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [isGameActive, setIsGameActive] = useState<boolean>(false);
  const [isPodium, setIsPodium] = useState<boolean>(false);
  const [podiumPlayers, setPodiumPlayers] = useState<PodiumPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      console.error(err);
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchRoomState();
  }, [fetchRoomState]);

  // Synced 3-2-1 Countdown (FR-GAME-1)
  useEffect(() => {
    if (!room || isGameActive || isPodium) return;

    let count = 3;
    sound.playTick();

    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        sound.playTick();
      } else {
        clearInterval(interval);
        setCountdown(null);
        setIsGameActive(true);
        sound.playGo();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room, isGameActive, isPodium]);

  // Handle Game Completion -> Show Podium
  const handleFinishGame = async (gameScores: { [userId: string]: number }) => {
    setIsGameActive(false);
    setIsPodium(true);

    // Compute updated cumulative scores and rankings
    const updatedPodiumList: PodiumPlayer[] = players.map((p) => {
      const matchScore = gameScores[p.user_id] || 0;
      const totalScore = (p.total_score || 0) + matchScore;

      return {
        userId: p.user_id,
        displayName: p.profile?.display_name || 'Player',
        avatarId: p.profile?.avatar_id || 'avatar-01',
        gameScore: matchScore,
        totalScore,
        rank: 0,
      };
    });

    // Rank by total score descending
    updatedPodiumList.sort((a, b) => b.totalScore - a.totalScore);
    updatedPodiumList.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    setPodiumPlayers(updatedPodiumList);

    // Update cumulative total scores in room_players
    if (room && user?.id === room.host_id) {
      for (const p of updatedPodiumList) {
        await supabase
          .from('room_players')
          .update({ total_score: p.totalScore })
          .eq('room_id', room.id)
          .eq('user_id', p.userId);
      }
    }
  };

  const handlePlayAgain = () => {
    setIsPodium(false);
    setCountdown(3);
    setIsGameActive(false);
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

  // Podium View (FR-ROOM-9)
  if (isPodium) {
    return (
      <Podium
        players={podiumPlayers}
        gameTitle={room.current_game || 'Arcade Match'}
        isHost={user.id === room.host_id}
        onPlayAgain={handlePlayAgain}
        onPickAnotherGame={handleBackToLobby}
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  // Active Game View
  return (
    <div className="flex-1 flex flex-col">
      {room.current_game === 'reaction' && (
        <ReactionDuel
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}

      {room.current_game === 'typing' && (
        <TypingRace
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}

      {room.current_game === 'quiz' && (
        <QuickDrawQuiz
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}

      {room.current_game === 'pictionary' && (
        <Pictionary
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}

      {room.current_game === 'charades' && (
        <EmojiCharades
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}

      {room.current_game === 'wordchain' && (
        <WordChainBlitz
          room={room}
          players={players}
          userId={user.id}
          isHost={user.id === room.host_id}
          onFinishGame={handleFinishGame}
        />
      )}
    </div>
  );
};
