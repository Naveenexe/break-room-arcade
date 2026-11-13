import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyRound, AlertCircle } from 'lucide-react';

export const JoinRoomPage: React.FC = () => {
  const { code: paramCode } = useParams<{ code?: string }>();
  const { user } = useAuthStore();
  const [code, setCode] = useState(paramCode || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (paramCode) {
      setCode(paramCode.toUpperCase());
    }
  }, [paramCode]);

  const handleJoin = async (e: React.FormEvent) => {
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

    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 5) {
      setError('Room code must be exactly 5 letters.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_room', {
        p_code: cleanCode,
        p_room_password: password.trim(),
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (data && data.code) {
        navigate(`/room/${data.code}`);
      }
    } catch {
      setError('Could not join room. Check code and password or network status.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md tile-modal p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-[16px] bg-primary items-center justify-center text-3xl mb-3 border-2 border-ink shadow-tile text-ink">
            🔑
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-text">Join a Room</h1>
          <p className="text-sm text-text-muted mt-1">Enter room code and password from the host</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-input bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <Input
            label="Room Code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={5}
            required
            className="text-center font-heading font-bold uppercase tracking-widest text-lg"
          />

          <Input
            label="Room Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            required
            autoComplete="off"
            hint="Set by the room host"
          />

          <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isLoading} className="mt-2">
            <KeyRound className="w-5 h-5 mr-2" />
            Enter Room
          </Button>
        </form>
      </div>
    </div>
  );
};
