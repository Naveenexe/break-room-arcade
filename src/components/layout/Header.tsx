import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, Moon, Sun, Wifi, WifiOff, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { timeSync, SyncStatus } from '@/lib/time-sync';
import { Avatar } from '@/components/ui/Avatar';

interface HeaderProps {
  roomCode?: string;
}

export const Header: React.FC<HeaderProps> = ({ roomCode }) => {
  const { user, profile, signOut } = useAuthStore();
  const { theme, toggleTheme, isMuted, toggleMute } = useSettingsStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(timeSync.getStatus());
  const [copiedCode, setCopiedCode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = timeSync.subscribe(setSyncStatus);
    return () => unsubscribe();
  }, []);

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-surface border-b-2 border-line px-4 py-2.5 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Logo Mark & Wordmark */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src="/art/logo-mark.svg"
            alt="Break Room Arcade"
            className="w-9 h-9 transition-transform group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="font-heading font-extrabold text-lg md:text-xl text-text leading-tight tracking-tight">
              Break Room <span className="text-primary">Arcade</span>
            </span>
          </div>
        </Link>

        {/* Center: Room Code Tile if in room */}
        {roomCode && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-[12px] bg-surface-raised border-2 border-line hover:border-primary transition-all text-xs md:text-sm font-heading font-bold shadow-tile-sm"
            title="Click to copy room code"
          >
            <span className="text-text-muted">ROOM</span>
            <span className="text-warn tracking-widest text-sm md:text-base font-black">{roomCode}</span>
            <span className="text-xs text-text-muted">
              {copiedCode ? '✓ Copied' : '📋'}
            </span>
          </button>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Sync Status Badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-xs font-semibold border ${
              syncStatus.status === 'synced'
                ? 'bg-success/15 border-success/30 text-success'
                : syncStatus.status === 'slow'
                ? 'bg-warn/15 border-warn/30 text-warn'
                : 'bg-danger/15 border-danger/30 text-danger'
            }`}
            title={`Offset: ${syncStatus.offset}ms, RTT: ${syncStatus.rtt}ms`}
          >
            {syncStatus.status === 'synced' ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Synced</span>
              </>
            ) : syncStatus.status === 'slow' ? (
              <>
                <Wifi className="w-3.5 h-3.5 animate-pulse" />
                <span>Slow ({syncStatus.rtt}ms)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Reconnecting…</span>
              </>
            )}
          </div>

          {/* Sound Mute Toggle */}
          <button
            onClick={toggleMute}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-surface-raised border-2 border-line text-text hover:border-primary transition-colors btn-hard"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-danger" /> : <Volume2 className="w-4 h-4 text-success" />}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-surface-raised border-2 border-line text-text hover:border-primary transition-colors btn-hard"
            title={theme === 'dark' ? 'Switch to Rooftop Day' : 'Switch to Rooftop Night'}
            aria-label={theme === 'dark' ? 'Switch to Rooftop Day' : 'Switch to Rooftop Night'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-warn" /> : <Moon className="w-4 h-4 text-primary" />}
          </button>

          {/* Profile / Logout */}
          {user ? (
            <div className="flex items-center gap-1.5 pl-1 border-l-2 border-line">
              <Link
                to="/profile"
                className="flex items-center gap-2 p-1 rounded-[10px] hover:bg-surface-raised transition-colors"
                title="Edit Profile"
              >
                <Avatar
                  avatarId={profile?.avatar_id || 'avatar-01'}
                  name={profile?.display_name || user.email || 'Player'}
                  size="sm"
                />
                <span className="hidden md:inline-block font-heading font-bold text-xs text-text max-w-[100px] truncate">
                  {profile?.display_name || user.email?.split('@')[0]}
                </span>
              </Link>
              <button
                onClick={() => signOut().then(() => navigate('/'))}
                className="p-1.5 text-text-muted hover:text-danger rounded-[10px] transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 pl-1 border-l-2 border-line">
              <Link
                to="/login"
                className="text-xs font-heading font-bold px-3 py-1.5 rounded-[10px] bg-primary text-ink border-2 border-ink btn-hard"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
