import { useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';

// ── Singleton watcher: ensures timers & listeners are registered only once ──

let initialized = false;
let statsRefreshing = false;

function initSessionWatcher() {
  if (initialized) return;
  initialized = true;

  const store = useSessionStore.getState();
  const getInterval = () => useSettingsStore.getState().refreshInterval;

  // Initial load
  store.refreshAll();

  // Periodic polling (re-reads interval each cycle)
  const schedule = () => {
    window.setTimeout(() => {
      useSessionStore.getState().refreshAll();
      schedule();
    }, getInterval() * 1000);
  };
  schedule();

  // File watcher event from Tauri backend
  listen('claude-sessions-changed', () => {
    useSessionStore.getState().refreshAll();
  });

  // Delayed stats refresh
  window.setTimeout(() => {
    const runStatsRefresh = async (incremental: boolean) => {
      if (statsRefreshing) return;
      statsRefreshing = true;
      try {
        if (incremental) {
          await useSessionStore.getState().refreshStatsCacheIncremental();
        } else {
          await useSessionStore.getState().refreshStatsCache();
        }
      } catch (e) {
        console.error(
          incremental
            ? 'Failed to refresh stats cache incrementally:'
            : 'Failed to refresh stats cache:',
          e
        );
      } finally {
        statsRefreshing = false;
      }
    };

    runStatsRefresh(false);
    window.setInterval(() => {
      runStatsRefresh(true);
    }, 60_000);
  }, 60_000);
}

// ── Hook: pure consumer, no side-effects per component instance ──

export function useClaudeSessions() {
  initSessionWatcher();

  const sessions = useSessionStore((s) => s.sessions);
  const stats = useSessionStore((s) => s.stats);
  const loading = useSessionStore((s) => s.loading);
  const lastUpdated = useSessionStore((s) => s.lastUpdated);
  const refreshAll = useSessionStore((s) => s.refreshAll);

  const workingSessions = useMemo(
    () => sessions.filter((s) => s.status === 'working'),
    [sessions]
  );
  const needsInputSessions = useMemo(
    () => sessions.filter((s) => s.status === 'needsinput'),
    [sessions]
  );
  const doneSessions = useMemo(
    () => sessions
      .filter((s) => s.status === 'done')
      .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt)),
    [sessions]
  );

  return {
    sessions,
    workingSessions,
    needsInputSessions,
    doneSessions,
    stats,
    loading,
    lastUpdated,
    refreshAll,
  };
}
