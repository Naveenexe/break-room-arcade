import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlusCircle, Shield, Users, AlertCircle, Sparkles } from 'lucide-react';

export const CreateRoomPage: React.FC = () => {
  const { user } = useAuthStore();
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [testingMode, setTestingMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      navigate('/login');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Follow SETUP.md to configure .env.local.');
      return;
    }

    const cleanPass = password.trim();
    if (cleanPass.length < 4 || cleanPass.length > 12) {
      setError('Room password must be between 4 and 12 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_room', {
        p_room_password: cleanPass,
        p_settings: {
          max_players: maxPlayers,
          testing_mode: testingMode,
          allow_voting: true,
        },
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (data && data.code) {
        navigate(`/room/${data.code}`);
      }
    } catch {
      setError('Failed to create room. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface p-6 md:p-8 rounded-modal border-2 border-line shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary items-center justify-center text-3xl mb-3 shadow-press text-bg">
            👑
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-text">Host a New Room</h1>
          <p className="text-sm text-text-muted mt-1">Set a password and invite your friends</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-input bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-5">
          <Input
            label="Room Password (4 to 12 chars)"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="e.g. coffee12"
            minLength={4}
            maxLength={12}
            required
            hint="Share this password with players so they can join."
          />

          {/* Max Players Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-text flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Player Limit
              </label>
              <span className="font-heading font-bold text-primary">{maxPlayers} Players</span>
            </div>
            <input
              type="range"
              min={4}
              max={12}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10))}
              className="w-full accent-primary h-2 bg-surface-raised rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-text-muted">
              <span>Min 4</span>
              <span>Default 8</span>
              <span>Max 12</span>
            </div>
          </div>

          {/* Testing Mode Switch (FR-ROOM-6) */}
          <div className="p-3.5 rounded-card bg-surface-raised border border-line flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-heading font-bold text-warn flex items-center gap-1">
                  <Sparkles className="w-4 h-4" />
                  Testing Mode
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-warn/20 text-warn border border-warn/30">
                  Allow 2+ Players
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Lets you start games with just 2 players so you can test gameplay with two devices.
              </p>
            </div>
            <input
              type="checkbox"
              id="testing-mode"
              checked={testingMode}
              onChange={(e) => setTestingMode(e.target.checked)}
              className="w-5 h-5 accent-warn mt-1 rounded cursor-pointer"
            />
          </div>

          <div className="text-xs text-text-muted flex items-center gap-2">
            <Shield className="w-4 h-4 text-success flex-shrink-0" />
            <span>Room code is auto-generated (5 unambiguous characters).</span>
          </div>

          <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isLoading} className="mt-2">
            <PlusCircle className="w-5 h-5 mr-2" />
            Create Room & Open Lobby
          </Button>
        </form>
      </div>
    </div>
  );
};

