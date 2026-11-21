import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { RULES_ACCEPTED_STORAGE_KEY, useAuctionStore } from './useAuctionStore';

export const DEVICE_ID_STORAGE_KEY = 'ipl_device_id';
export const DEVICE_LIMIT_ERROR_MESSAGE =
  'You were signed out because this account is logged in on more than 5 devices.';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  rules_accepted_at: string | null;
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'ssr-device';
  }
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim() !== '') {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-fallback`;
  }
}

async function fetchAndSyncProfile(user: User): Promise<UserProfile> {
  const fallbackName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    user.email?.split('@')[0] ||
    'Franchise Manager';

  const fallbackProfile: UserProfile = {
    id: user.id,
    full_name: fallbackName,
    email: user.email ?? '',
    rules_accepted_at: null,
  };

  if (!supabase) return fallbackProfile;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, rules_accepted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    return fallbackProfile;
  }

  let profile: UserProfile = {
    id: data.id,
    full_name: data.full_name || fallbackName,
    email: data.email || user.email || '',
    rules_accepted_at: data.rules_accepted_at ?? null,
  };

  let localAccepted = false;
  try {
    localAccepted = window.localStorage.getItem(RULES_ACCEPTED_STORAGE_KEY) === 'true';
  } catch {
    localAccepted = false;
  }

  // Sync localStorage rule acceptance to profile if user accepted before logging in
  if (localAccepted && !profile.rules_accepted_at) {
    const acceptedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ rules_accepted_at: acceptedAt })
      .eq('id', user.id);

    if (!updateErr) {
      profile = { ...profile, rules_accepted_at: acceptedAt };
    }
  } else if (profile.rules_accepted_at && !localAccepted) {
    // Sync DB rule acceptance back into client store on fresh devices
    useAuctionStore.getState().acceptRules();
  }

  return profile;
}

interface AuthStoreState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  deviceId: string;
  kickedMessage: string | null;
  initialized: boolean;
  initializeAuth: () => () => void;
  completeAuthSession: (session: Session) => Promise<void>;
  touchCurrentSession: () => Promise<boolean>;
  syncRulesAcceptedAt: () => Promise<void>;
  logout: () => Promise<void>;
  clearKickedMessage: () => void;
}

// Guards against onAuthStateChange racing ahead of explicit sign-in/sign-up RPC calls
let explicitAuthInProgress = false;

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  deviceId: getOrCreateDeviceId(),
  kickedMessage: null,
  initialized: false,

  clearKickedMessage: () => set({ kickedMessage: null }),

  initializeAuth: () => {
    if (!isSupabaseConfigured || !supabase) {
      set({ loading: false, initialized: true });
      return () => {};
    }

    let cancelled = false;

    const restore = async () => {
      try {
        const { data, error } = await supabase!.auth.getSession();
        if (cancelled) return;

        if (error || !data.session) {
          set({ session: null, profile: null, loading: false, initialized: true });
          return;
        }

        const restoredSession = data.session;
        const { deviceId } = get();

        // Check device validity without re-registering (never call register_session here)
        const { data: validDevice, error: touchErr } = await supabase!.rpc('touch_session', {
          p_device_id: deviceId,
        });

        if (cancelled) return;

        if (!touchErr && validDevice === false) {
          await supabase!.auth.signOut();
          set({
            session: null,
            profile: null,
            loading: false,
            initialized: true,
            kickedMessage: DEVICE_LIMIT_ERROR_MESSAGE,
          });
          return;
        }

        const profile = await fetchAndSyncProfile(restoredSession.user);
        if (cancelled) return;

        set({
          session: restoredSession,
          profile,
          loading: false,
          initialized: true,
        });
      } catch {
        if (!cancelled) {
          set({ session: null, profile: null, loading: false, initialized: true });
        }
      }
    };

    void restore();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      if (event === 'SIGNED_OUT' || !nextSession) {
        set({ session: null, profile: null, loading: false });
        return;
      }

      if (explicitAuthInProgress) {
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        set({ session: nextSession });
        return;
      }

      if (event === 'SIGNED_IN') {
        set({ session: nextSession });
        void fetchAndSyncProfile(nextSession.user).then((profile) => {
          if (!cancelled) {
            set({ profile, loading: false });
          }
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  },

  completeAuthSession: async (session: Session) => {
    if (!supabase) return;

    explicitAuthInProgress = true;
    const { deviceId } = get();

    try {
      const { error: regError } = await supabase.rpc('register_session', {
        p_device_id: deviceId,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      });

      if (regError) {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut cleanup errors
        }
        throw new Error(regError.message || 'Could not register this device session.');
      }

      const profile = await fetchAndSyncProfile(session.user);
      set({
        session,
        profile,
        loading: false,
        kickedMessage: null,
      });
    } finally {
      explicitAuthInProgress = false;
    }
  },

  touchCurrentSession: async () => {
    const { session, deviceId } = get();
    if (!supabase || !session) return true;

    try {
      const { data, error } = await supabase.rpc('touch_session', {
        p_device_id: deviceId,
      });

      if (!error && data === false) {
        try {
          await supabase.auth.signOut();
        } catch {
          // Proceed with local sign-out cleanup regardless
        }
        set({
          session: null,
          profile: null,
          loading: false,
          kickedMessage: DEVICE_LIMIT_ERROR_MESSAGE,
        });
        return false;
      }

      return true;
    } catch {
      return true;
    }
  },

  syncRulesAcceptedAt: async () => {
    const { session, profile } = get();
    if (!supabase || !session) return;

    const acceptedAt = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ rules_accepted_at: acceptedAt })
      .eq('id', session.user.id);

    if (!error && profile) {
      set({
        profile: {
          ...profile,
          rules_accepted_at: acceptedAt,
        },
      });
    }
  },

  logout: async () => {
    const { deviceId } = get();
    if (supabase) {
      try {
        await supabase.rpc('end_session', { p_device_id: deviceId });
      } catch {
        // Proceed with signOut even if session row already ended
      }
      try {
        await supabase.auth.signOut();
      } catch {
        // Clear local state regardless
      }
    }
    set({
      session: null,
      profile: null,
      loading: false,
      kickedMessage: null,
    });
  },
}));
