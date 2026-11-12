import { create } from 'zustand';
import { sound } from '@/lib/sound';

interface SettingsState {
  theme: 'dark' | 'light';
  isMuted: boolean;
  volume: number;
  reducedMotion: boolean;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  toggleMute: () => void;
  setVolume: (vol: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Initial theme detection
  let initialTheme: 'dark' | 'light' = 'dark';
  let initialReducedMotion = false;

  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('arcade_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      initialTheme = savedTheme;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      initialTheme = 'light';
    }

    initialReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Apply class to documentElement
    if (initialTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }

  return {
    theme: initialTheme,
    isMuted: sound.getMuted(),
    volume: sound.getVolume(),
    reducedMotion: initialReducedMotion,

    setTheme: (theme) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('arcade_theme', theme);
        if (theme === 'light') {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }
      }
      set({ theme });
    },

    toggleTheme: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      get().setTheme(next);
    },

    toggleMute: () => {
      const isMuted = sound.toggleMute();
      set({ isMuted });
    },

    setVolume: (vol) => {
      sound.setVolume(vol);
      set({ volume: vol });
    },
  };
});
