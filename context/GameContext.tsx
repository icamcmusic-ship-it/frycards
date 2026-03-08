import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';
import { DashboardData } from '../types';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface GameContextType {
  user: User | null;
  dashboard: DashboardData | null;
  loading: boolean;
  error: string | null;
  toasts: ToastMessage[];
  pendingTradeCount: number;
  refreshDashboard: () => Promise<void>;
  signInWithDiscord: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingTradeCount, setPendingTradeCount] = useState(0);

  const refreshInProgress = useRef(false);
  // BUG FIX #1: Track pending refreshes so post-action updates are never silently dropped.
  // Previously, any refreshDashboard() call while a refresh was in progress was simply
  // discarded — meaning buying a pack, claiming a reward, etc. would never update the UI
  // if a background refresh happened to overlap.
  const pendingRefreshRequested = useRef(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Toast System ──────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── refreshDashboard ──────────────────────────────────────────────────────
  const refreshDashboard = useCallback(async () => {
    if (!user) return;

    // BUG FIX #1 (continued): Instead of silently returning, queue a follow-up refresh.
    // This ensures that post-action calls (buy pack, claim reward, etc.) are never lost.
    if (refreshInProgress.current) {
      pendingRefreshRequested.current = true;
      return;
    }

    refreshInProgress.current = true;
    pendingRefreshRequested.current = false;
    if (mountedRef.current) setError(null);

    try {
      // Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Stats
      let statsData = null;
      const { data: rpcStats, error: statsError } = await supabase.rpc('get_my_collection_stats');
      if (!statsError && rpcStats) {
        statsData = rpcStats;
      } else {
        console.error('Stats fetch failed', statsError);
        statsData = {
          total_cards: 0,
          unique_cards: 0,
          total_possible: 100,
          completion_percentage: 0,
          rarity_breakdown: [],
          set_completion: [],
        };
      }

      // Daily Missions
      let finalMissions: any[] = [];
      if (!user.is_anonymous) {
        const { data: missions, error: missionsError } = await supabase.rpc('ensure_and_get_daily_missions');
        if (!missionsError && missions) {
          // ensure_and_get_daily_missions returns json — could be array or object
          finalMissions = Array.isArray(missions) ? missions : [];
        } else {
          // BUG FIX #4: daily_missions.created_at is a `date` column — use eq(), not gte() with ISO string
          try {
            const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
            const { data: fallbackMissions } = await supabase
              .from('daily_missions')
              .select('*')
              .eq('user_id', user.id)
              .eq('created_at', todayStr);
            finalMissions = fallbackMissions || [];
          } catch (e) {
            console.warn('Mission fallback also failed', e);
            finalMissions = [];
          }
        }
      }

      // Pending Trade Count
      try {
        const { count, error: countError } = await supabase
          .from('trade_offers')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('status', 'pending');
        if (!countError && mountedRef.current) {
          setPendingTradeCount(count || 0);
        }
      } catch (e) {
        console.warn('Failed to fetch pending trades', e);
      }

      // BUG FIX #3: Use local date for can_claim_daily comparison, not UTC.
      // new Date().toISOString() returns UTC — if the player is UTC+X and it's past
      // midnight locally but still "yesterday" in UTC, the daily claim would wrongly
      // appear unavailable. toLocaleDateString('en-CA') gives YYYY-MM-DD in local time.
      const todayLocalDate = new Date().toLocaleDateString('en-CA');

      const dashboardData: DashboardData = {
        profile: profile as any,
        stats: statsData,
        missions: finalMissions,
        can_claim_daily: profile.last_daily_claim !== todayLocalDate,
      };

      if (mountedRef.current) setDashboard(dashboardData);

    } catch (err: any) {
      console.error('Dashboard Error:', err);
      if (mountedRef.current) setError(err.message);
    } finally {
      refreshInProgress.current = false;
      // BUG FIX #1 (final): Run the queued refresh now that we're free.
      if (pendingRefreshRequested.current && mountedRef.current) {
        pendingRefreshRequested.current = false;
        // Small delay prevents micro-thrash if two actions fire back-to-back
        setTimeout(() => refreshDashboard(), 50);
      }
    }
  }, [user]);

  // ── Auth Initialization ───────────────────────────────────────────────────
  useEffect(() => {
    // BUG FIX #2: Deduplicate the double auth event.
    // Both getSession() and onAuthStateChange(INITIAL_SESSION) fire on page load,
    // each calling setUser(). Two different User object references for the same
    // account cause refreshDashboard to regenerate (via useCallback([user])), 
    // triggering the effect twice. The second call hits the refreshInProgress lock
    // and returns early, which then immediately calls setLoading(false) before data
    // is actually fetched. We guard with `authInitialized` to prevent this.
    let authInitialized = false;

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mountedRef.current) {
        authInitialized = true;
        setUser(session?.user ?? null);
        if (!session) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      // Skip the INITIAL_SESSION event if getSession() already handled it
      if (_event === 'INITIAL_SESSION' && authInitialized) return;
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshDashboard().finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    }
  }, [user, refreshDashboard]);

  // ── Auth Actions ──────────────────────────────────────────────────────────
  const signInWithDiscord = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    });
    if (error && mountedRef.current) {
      setLoading(false);
      showToast(error.message, 'error');
    }
  };

  const signInAsGuest = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error && mountedRef.current) {
      setLoading(false);
      showToast(error.message, 'error');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setDashboard(null);
      setLoading(false);
    }
  };

  return (
    <GameContext.Provider
      value={{
        user,
        dashboard,
        loading,
        error,
        toasts,
        pendingTradeCount,
        refreshDashboard,
        signInWithDiscord,
        signInAsGuest,
        signOut,
        showToast,
        removeToast,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};