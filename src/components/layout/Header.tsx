import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, Moon, Sun, Wifi, WifiOff, LogOut, User } from 'lucide-react';
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
    <header className="sticky top-0 z-40 w-full bg-surface/80 backdrop-blur-md border-b-2 border-line px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-heading font-black text-bg text-xl shadow-press group-hover:scale-105 transition-transform">
            🕹️
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-bold text-lg md:text-xl text-text leading-tight tracking-tight">
              Break Room <span className="text-primary">Arcade</span>
            </span>
          </div>
        </Link>

        {/* Center: Room Code Badge if in room */}
        {roomCode && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border-2 border-line hover:border-primary transition-all text-xs md:text-sm font-heading font-bold"
            title="Click to copy room code"
          >
            <span className="text-text-muted">ROOM</span>
            <span className="text-warn tracking-widest text-sm md:text-base">{roomCode}</span>
            <span className="text-xs text-text-muted">
              {copiedCode ? '✓ Copied' : '📋'}
            </span>
          </button>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Sync Status Badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              syncStatus.status === 'synced'
                ? 'bg-success/10 border-success/30 text-success'
                : syncStatus.status === 'slow'
                ? 'bg-warn/10 border-warn/30 text-warn'
                : 'bg-danger/10 border-danger/30 text-danger'
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
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border-2 border-line text-text hover:bg-surface-raised transition-colors"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-danger" /> : <Volume2 className="w-5 h-5 text-success" />}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border-2 border-line text-text hover:bg-surface-raised transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-warn" /> : <Moon className="w-5 h-5 text-primary" />}
          </button>

          {/* User Profile / Auth State */}
          {user ? (
            <div className="flex items-center gap-2 pl-1 border-l border-line">
              <Link
                to="/profile"
                className="flex items-center gap-2 hover:opacity-85 transition-opacity"
                title="Edit Profile"
              >
                <Avatar
                  avatarId={profile?.avatar_id || 'avatar-01'}
                  name={profile?.display_name || 'Player'}
                  size="sm"
                />
                <span className="hidden md:inline text-sm font-semibold text-text max-w-[120px] truncate">
                  {profile?.display_name || 'Player'}
                </span>
              </Link>
              <button
                onClick={() => {
                  signOut();
                  navigate('/login');
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-danger hover:bg-surface-raised transition-colors"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-bg font-heading font-bold text-sm hover:brightness-105 transition-all shadow-press"
            >
              <User className="w-4 h-4" />
              <span>Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

