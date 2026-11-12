import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Profile } from '@/types/database';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    if (!isSupabaseConfigured) {
      set({ isLoading: false, isInitialized: true });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;

      if (currentUser) {
        // Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        set({ user: currentUser, profile, isLoading: false, isInitialized: true });
      } else {
        set({ user: null, profile: null, isLoading: false, isInitialized: true });
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const updatedUser = session?.user ?? null;
        if (updatedUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', updatedUser.id)
            .single();

          set({ user: updatedUser, profile, isLoading: false });
        } else {
          set({ user: null, profile: null, isLoading: false });
        }
      });
    } catch (err) {
      console.error('Error during auth initialization:', err);
      set({ isLoading: false, isInitialized: true });
    }
  },

  setProfile: (profile: Profile) => set({ profile }),

  signOut: async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    set({ user: null, profile: null });
  },
}));

