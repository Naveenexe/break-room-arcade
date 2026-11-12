import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { AVATARS } from '@/lib/avatars';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Check, UserCheck, AlertCircle } from 'lucide-react';

export const ProfileSetupPage: React.FC = () => {
  const { user, profile, setProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [selectedAvatarId, setSelectedAvatarId] = useState(profile?.avatar_id || 'avatar-01');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setSelectedAvatarId(profile.avatar_id);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = displayName.trim();
    if (cleanName.length < 2 || cleanName.length > 20) {
      setError('Display name must be between 2 and 20 characters.');
      return;
    }

    if (!user) {
      setError('You must be logged in to update your profile.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: cleanName,
          avatar_id: selectedAvatarId,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (updateError) {
        setError(updateError.message);
        return;
      }

      if (data) {
        setProfile(data);
        setSavedSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 800);
      }
    } catch {
      setError('Failed to save profile. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-6 px-4">
      <div className="w-full max-w-2xl bg-surface p-6 md:p-8 rounded-modal border-2 border-line shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-text">Choose Your Mascot</h1>
          <p className="text-sm text-text-muted mt-1">Pick a character and name your friends will recognise</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-input bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Live Preview */}
          <div className="flex flex-col items-center justify-center p-4 bg-surface-raised rounded-card border-2 border-line">
            <Avatar avatarId={selectedAvatarId} name={displayName || 'Player'} size="xl" />
            <span className="font-heading font-bold text-xl text-text mt-3">
              {displayName.trim() || 'Player'}
            </span>
          </div>

          {/* Name Input */}
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Captain Pixel"
            minLength={2}
            maxLength={20}
            required
            hint="2 to 20 characters. Visible to all players in the room."
          />

          {/* 20 Mascot Grid */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text">Select Mascot (20 Avatars)</label>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 p-3 bg-bg/50 rounded-card border-2 border-line max-h-72 overflow-y-auto">
              {AVATARS.map((avatar) => {
                const isSelected = avatar.id === selectedAvatarId;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatarId(avatar.id)}
                    className={`relative p-2 rounded-2xl flex flex-col items-center gap-1 transition-all border-2 ${
                      isSelected
                        ? 'border-primary bg-primary/20 scale-105 shadow-md'
                        : 'border-transparent hover:border-line hover:bg-surface'
                    }`}
                  >
                    <Avatar avatarId={avatar.id} size="md" />
                    <span className="text-[11px] font-semibold text-text truncate max-w-full text-center">
                      {avatar.name}
                    </span>
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-bg rounded-full flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" variant="primary" fullWidth isLoading={isLoading}>
            {savedSuccess ? (
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" /> Saved! Redirecting…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <UserCheck className="w-5 h-5" /> Save & Enter Arcade
              </span>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

