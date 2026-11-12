import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AlertTriangle } from 'lucide-react';

export const Layout: React.FC = () => {
  const location = useLocation();

  // Extract room code if in room URL e.g. /room/ABCDE
  const roomMatch = location.pathname.match(/\/room\/([A-Z0-9]{5})/i);
  const currentRoomCode = roomMatch ? roomMatch[1].toUpperCase() : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      {/* Configuration warning banner if Supabase is unconfigured */}
      {!isSupabaseConfigured && (
        <div className="bg-warn/20 border-b border-warn/40 text-warn px-4 py-2 text-xs md:text-sm text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Supabase is not configured yet. Follow <strong>SETUP.md</strong> to add your credentials to <code>.env.local</code>.
          </span>
        </div>
      )}

      <Header roomCode={currentRoomCode} />

      <main className="flex-1 flex flex-col max-w-6xl w-full mx-auto p-4 md:p-6">
        <Outlet />
      </main>

      <footer className="w-full border-t border-line/40 py-4 px-4 text-center text-xs text-text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Break Room Arcade • Built for teams and friends</span>
          <div className="flex gap-4">
            <a href="/about" className="hover:text-text transition-colors">About & Rules</a>
            <span className="text-line">•</span>
            <span>Version 1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

