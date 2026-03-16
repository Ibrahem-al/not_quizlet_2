import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;

  setUser: (user: User | null, session: Session | null) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,

  setUser: (user: User | null, session: Session | null) => {
    set({ user, session });
  },

  signOut: async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    set({ user: null, session: null });
  },

  initialize: async () => {
    set({ loading: true });
    try {
      if (!supabase) {
        set({ user: null, session: null });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({
        user: session?.user ?? null,
        session: session ?? null,
      });
    } finally {
      set({ loading: false });
    }
  },
}));
