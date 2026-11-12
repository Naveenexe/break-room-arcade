import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sparkles, AlertCircle } from 'lucide-react';

export const SignUpPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Please configure credentials in .env.local.');
      return;
    }

    if (password.length !== 6) {
      setError('Password must be exactly 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        if (signUpError.message.includes('User already registered')) {
          setError('An account with this email already exists. Try signing in.');
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (data.user) {
        // FR-AUTH-2: Confirm email is off, land directly in profile setup
        navigate('/profile');
      }
    } catch {
      setError('Unable to reach server. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface p-6 md:p-8 rounded-modal border-2 border-line shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-warn items-center justify-center text-3xl mb-3 shadow-press text-bg">
            ✨
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-text">Get Arcade Pass</h1>
          <p className="text-sm text-text-muted mt-1">Takes 10 seconds to join any room</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-input bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
            required
            autoComplete="email"
          />

          <Input
            label="6-Character Password"
            type="password"
            maxLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            hint="Use a simple password just for this game. Don't reuse a real one."
            required
            autoComplete="new-password"
          />

          <Button type="submit" variant="primary" fullWidth isLoading={isLoading} className="mt-2">
            <Sparkles className="w-4 h-4 mr-2" />
            Create Pass & Choose Avatar
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-text-muted border-t border-line/50 pt-4">
          Already got a pass?{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
