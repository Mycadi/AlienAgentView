import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { SessionInfo, StatsOverview } from '../types';

interface SessionState {
  sessions: SessionInfo[];
  stats: StatsOverview | null;
  loading: boolean;
  lastUpdated: Date | null;

  fetchSessions: () => Promise<void>;
  fetchStats: () => Promise<void>;
  refreshStatsCache: () => Promise<void>;
  refreshStatsCacheIncremental: () => Promise<void>;
  refreshAll: () => Promise<void>;
  focusSessionWindow: (sessionId: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  stats: null,
  loading: false,
  lastUpdated: null,

  fetchSessions: async () => {
    try {
      const sessions = await invoke<SessionInfo[]>('get_sessions');
      set({ sessions, lastUpdated: new Date() });
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  },

  fetchStats: async () => {
    try {
      const stats = await invoke<StatsOverview>('get_stats');
      set({ stats });
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  },

  refreshStatsCache: async () => {
    const stats = await invoke<StatsOverview>('refresh_stats_cache');
    set({ stats });
  },

  refreshStatsCacheIncremental: async () => {
    const stats = await invoke<StatsOverview>('refresh_stats_cache_incremental');
    set({ stats });
  },

  refreshAll: async () => {
    set({ loading: true });
    await get().fetchSessions();
    set({ loading: false });
  },

  focusSessionWindow: async (sessionId: string) => {
    try {
      await invoke('focus_window_by_session_id', { sessionId });
    } catch (e) {
      console.error('Failed to focus session window:', e);
    }
  },
}));
