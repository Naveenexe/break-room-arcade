import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { timeSync } from '@/lib/time-sync';
import type { Room, RoomPlayer, Profile } from '@/types/database';
import {
  Copy,
  Share2,
  Crown,
  Play,
  Sparkles,
  Users,
  Vote,
  AlertCircle,
  LogOut,
  UserX,
} from 'lucide-react';

interface PlayerWithProfile extends RoomPlayer {
  profile?: Profile;
}

export const LobbyPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [selectedGame, setSelectedGame] = useState<string>('quiz');
  const [allowVoting, setAllowVoting] = useState<boolean>(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isHost = room?.host_id === user?.id;
  const isTestingMode = Boolean(room?.settings?.testing_mode);
  const minRequiredPlayers = isTestingMode ? 2 : 4;
  const activePlayers = players.filter((p) => !p.is_spectator);
  const canStart = activePlayers.length >= minRequiredPlayers;

  // Fetch full room data
  const fetchRoomData = useCallback(async () => {
    if (!code || !isSupabaseConfigured) return;

    try {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

      if (roomError || !roomData) {
        setError('Room not found or expired.');
        setIsLoading(false);
        return;
      }

      setRoom(roomData);
      setSelectedGame(roomData.current_game || 'quiz');
      setAllowVoting(Boolean(roomData.settings?.allow_voting));

      // Fetch room players with profiles
      const { data: playersData } = await supabase
        .from('room_players')
        .select('*, profile:profiles(*)')
        .eq('room_id', roomData.id)
        .order('joined_at', { ascending: true });

      if (playersData) {
        setPlayers(playersData as unknown as PlayerWithProfile[]);
      }

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchRoomData();

    if (!code || !isSupabaseConfigured) return;

    // Realtime subscription on room and players changes
    const channel = supabase
      .channel(`room_lobby:${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code.toUpperCase()}` },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as Room;
            setRoom(updated);
            if (updated.status === 'in_game') {
              // Game started! Navigate to game screen
              navigate(`/room/${code}/play`);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players' },
        () => {
          fetchRoomData();
        }
      )
      .subscribe();

    // Heartbeat every 10 seconds (TM-6)
    const heartbeatInterval = window.setInterval(async () => {
      if (room && user) {
        await supabase
          .from('room_players')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .eq('user_id', user.id);
      }
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
    };
  }, [code, fetchRoomData, room?.id, user?.id, navigate]);

  const handleCopyInvite = () => {
    if (!room) return;
    const inviteUrl = `${window.location.origin}/join/${room.code}`;
    const text = `Join my Break Room Arcade game! Code: ${room.code} at ${inviteUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleKickPlayer = async (targetUserId: string) => {
    if (!room || !isHost) return;
    try {
      await supabase.rpc('kick_player', {
        p_room_id: room.id,
        p_target_user_id: targetUserId,
      });
      fetchRoomData();
    } catch (err) {
      console.error('Kick failed:', err);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room) return;
    try {
      await supabase.rpc('leave_room', { p_room_id: room.id });
      navigate('/');
    } catch {
      navigate('/');
    }
  };

  const handleStartGame = async () => {
    if (!room || !isHost || !canStart) return;

    try {
      const countdownEndsAt = new Date(timeSync.correctedNow() + 4000).toISOString();

      await supabase
        .from('rooms')
        .update({
          status: 'in_game',
          current_game: selectedGame,
          phase: 'countdown',
          phase_started_at: new Date(timeSync.correctedNow()).toISOString(),
          phase_ends_at: countdownEndsAt,
          version: room.version + 1,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', room.id);

      navigate(`/room/${room.code}/play`);
    } catch (err) {
      console.error('Error starting game:', err);
    }
  };

  const games = [
    { id: 'quiz', name: 'Quick Draw Quiz', icon: '💡', desc: 'Speed multiple-choice buzzer' },
    { id: 'reaction', name: 'Reaction Duel', icon: '⚡', desc: 'Milliseconds precision tap' },
    { id: 'typing', name: 'Typing Race', icon: '🏁', desc: 'Race your friends across lanes' },
    { id: 'pictionary', name: 'Pictionary', icon: '🎨', desc: 'Live shared drawing & guessing' },
    { id: 'charades', name: 'Emoji Charades', icon: '🎭', desc: 'Act out prompts with emoji only' },
    { id: 'wordchain', name: 'Word Chain Blitz', icon: '🔗', desc: 'Elimination word linker' },
  ];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="font-heading font-semibold text-text-muted">Loading room lobby…</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center bg-surface p-8 rounded-modal border-2 border-line max-w-md">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-3" />
          <h2 className="text-xl font-bold font-heading">{error || 'Room not found'}</h2>
          <p className="text-sm text-text-muted mt-2">This room may have closed or expired.</p>
          <Button variant="primary" onClick={() => navigate('/')} className="mt-4">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 py-2">
      {/* Top Banner: Room Code & Invite Controls */}
      <div className="bg-surface p-5 rounded-card border-2 border-line flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="text-center sm:text-left">
            <span className="text-xs uppercase font-bold text-text-muted tracking-wider">Room Code</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                onClick={handleCopyCode}
                className="text-3xl sm:text-4xl font-black font-heading tracking-widest text-warn cursor-pointer hover:opacity-85 select-all"
                title="Click to copy code"
              >
                {room.code}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-1.5 rounded-lg bg-surface-raised border border-line text-text hover:text-primary transition-colors"
                title="Copy Room Code"
              >
                <Copy className="w-4 h-4" />
              </button>
              {copiedCode && <span className="text-xs font-bold text-success animate-fade">Copied!</span>}
            </div>
          </div>

          {isTestingMode && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-warn/15 border border-warn/30 text-warn text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Testing Mode Active (2+ Players)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="surface"
            size="sm"
            onClick={handleCopyInvite}
            className="flex-1 sm:flex-initial"
          >
            <Share2 className="w-4 h-4 mr-2" />
            {copiedInvite ? 'Link Copied!' : 'Copy Invite'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeaveRoom}
            className="text-text-muted hover:text-danger"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Grid: Left = Players, Right = Game Picker & Start */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Players List (FR-ROOM-4) */}
        <div className="lg:col-span-5 bg-surface p-5 rounded-card border-2 border-line flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h2 className="font-heading font-bold text-lg text-text flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Players in Room ({players.length}/{room.settings?.max_players || 8})
              </h2>
              <span className="text-xs font-semibold text-text-muted">
                {minRequiredPlayers}+ needed to play
              </span>
            </div>

            {/* Players Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {players.map((p) => {
                const isPlayerHost = p.user_id === room.host_id;
                const isMe = p.user_id === user?.id;

                return (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-line"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        avatarId={p.profile?.avatar_id || 'avatar-01'}
                        name={p.profile?.display_name || 'Player'}
                        size="md"
                        showCrown={isPlayerHost}
                      />
                      <div className="flex flex-col">
                        <span className="font-heading font-bold text-sm text-text flex items-center gap-1.5">
                          {p.profile?.display_name || 'Player'}
                          {isMe && <span className="text-xs text-primary font-normal">(You)</span>}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {isPlayerHost ? 'Room Host' : p.is_spectator ? 'Spectating' : 'Ready to play'}
                        </span>
                      </div>
                    </div>

                    {isHost && !isMe && (
                      <button
                        onClick={() => handleKickPlayer(p.user_id)}
                        className="text-text-muted hover:text-danger p-1 rounded transition-colors"
                        title="Kick player"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty Lobby Hint */}
            {players.length === 1 && (
              <div className="mt-4 p-4 rounded-xl bg-surface-raised/50 border border-line text-center">
                <p className="text-sm font-semibold text-warn">Waiting for more players…</p>
                <p className="text-xs text-text-muted mt-1">
                  Share the code <strong className="text-text">{room.code}</strong> with your friends to start playing.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-line/40 text-xs text-text-muted flex items-center justify-between">
            <span>Room Host: 👑 {players.find((p) => p.user_id === room.host_id)?.profile?.display_name || 'Host'}</span>
            <span>Realtime Synced</span>
          </div>
        </div>

        {/* Game Picker & Launch Panel (FR-ROOM-5) */}
        <div className="lg:col-span-7 bg-surface p-5 rounded-card border-2 border-line flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h2 className="font-heading font-bold text-lg text-text flex items-center gap-2">
                <Vote className="w-5 h-5 text-warn" />
                Select Game
              </h2>

              {isHost && (
                <div className="flex items-center gap-2">
                  <label htmlFor="vote-toggle" className="text-xs font-semibold text-text-muted cursor-pointer">
                    Room Vote
                  </label>
                  <input
                    id="vote-toggle"
                    type="checkbox"
                    checked={allowVoting}
                    onChange={(e) => setAllowVoting(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* 6 Game Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {games.map((g) => {
                const isSelected = selectedGame === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => setSelectedGame(g.id)}
                    className={`p-3.5 rounded-card text-left transition-all border-2 flex flex-col justify-between min-h-[110px] ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-md scale-[1.02]'
                        : 'border-line bg-surface-raised hover:border-text-muted/40'
                    } ${!isHost && 'cursor-default'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{g.icon}</span>
                      {isSelected && (
                        <span className="w-5 h-5 bg-primary text-bg rounded-full flex items-center justify-center text-xs font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-sm text-text leading-tight mt-2">
                        {g.name}
                      </h3>
                      <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                        {g.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="mt-6 pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-text-muted text-center sm:text-left">
              {!canStart ? (
                <span className="text-warn font-semibold">
                  ⚠️ Need at least {minRequiredPlayers} players to start ({activePlayers.length} currently).
                </span>
              ) : (
                <span className="text-success font-semibold">
                  ✓ Ready to play {games.find((g) => g.id === selectedGame)?.name}!
                </span>
              )}
            </div>

            {isHost ? (
              <Button
                variant="primary"
                size="lg"
                disabled={!canStart}
                onClick={handleStartGame}
                className="w-full sm:w-auto min-w-[200px]"
              >
                <Play className="w-5 h-5 mr-2" />
                Start Game
              </Button>
            ) : (
              <div className="p-3 rounded-full bg-surface-raised border border-line text-xs font-semibold text-text-muted flex items-center gap-2">
                <Crown className="w-4 h-4 text-warn" />
                Waiting for host to start the game…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
