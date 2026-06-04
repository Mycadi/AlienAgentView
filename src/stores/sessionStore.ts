import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { SessionInfo, StatsOverview, SessionStatus } from '../types';
import { useSettingsStore } from './settingsStore';

// 缓存上一次各 session 的状态，用于检测状态变化
let prevStatusMap: Map<string, SessionStatus> = new Map();

// 初始化时请求通知权限
let notificationReady: Promise<boolean> | null = null;
function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationReady) {
    notificationReady = (async () => {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }
      return granted;
    })();
  }
  return notificationReady;
}

// 监听托盘闪烁时的单击事件 → 跳转终端页
let trayListenerInit = false;
function initTrayClickListener() {
  if (trayListenerInit) return;
  trayListenerInit = true;
  listen('tray-click-while-flashing', () => {
    useSettingsStore.getState().setPage('terminal');
  });
  listen('navigate-to-terminal', () => {
    useSettingsStore.getState().setPage('terminal');
    // 显示并聚焦主窗口
    getCurrentWindow().show();
    getCurrentWindow().setFocus();
  });
}

async function notifyNeedsInput(session: SessionInfo) {
  try {
    const granted = await ensureNotificationPermission();
    console.log(`[notify] permission granted: ${granted}`);
    if (!granted) return;

    sendNotification({
      title: session.projectName || session.cwd,
      body: '等待输入',
    });
    console.log(`[notify] notification sent for: ${session.projectName}`);
  } catch (e) {
    console.error('[notify] error:', e);
  }

  // 开始托盘图标闪烁，tooltip 显示项目名
  const tooltip = `${session.projectName || session.cwd} - 等待输入`;
  invoke('start_tray_flash', { tooltip }).catch(() => {});

  // 窗口隐藏时预切换到终端页，用户点通知唤起窗口即可看到
  const mainWindow = getCurrentWindow();
  const visible = await mainWindow.isVisible();
  if (!visible) {
    useSettingsStore.getState().setPage('terminal');
  }
}

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
  focusSessionWindow: (sessionId: string, pid?: number) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  stats: null,
  loading: false,
  lastUpdated: null,

  fetchSessions: async () => {
    initTrayClickListener();
    try {
      const sessions = await invoke<SessionInfo[]>('get_sessions');

      // 检测 working → needsinput 的状态变化并发送通知
      for (const session of sessions) {
        const prev = prevStatusMap.get(session.sessionId);
        if (prev !== undefined && prev !== session.status) {
          console.log(`[notify] session ${session.sessionId} status: ${prev} → ${session.status}`);
        }
        if (prev === 'working' && session.status === 'needsinput') {
          console.log(`[notify] triggering notification for: ${session.projectName}`);
          notifyNeedsInput(session);
        }
      }

      // 没有 needsinput 的 session 时自动停止闪烁
      const hasNeedsInput = sessions.some((s) => s.status === 'needsinput');
      if (!hasNeedsInput) {
        invoke('stop_tray_flash').catch(() => {});
      }

      // 更新状态快照
      prevStatusMap = new Map(
        sessions.map((s) => [s.sessionId, s.status])
      );

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
    await Promise.all([get().fetchSessions(), get().fetchStats()]);
    set({ loading: false });
  },

  focusSessionWindow: async (sessionId: string, pid?: number) => {
    try {
      await invoke('focus_window_by_session_id', { sessionId });
    } catch {
      if (pid && pid > 0) {
        try {
          await invoke('focus_session_window', { pid });
        } catch (e2) {
          console.error('Failed to focus session window:', e2);
        }
      }
    }
  },
}));
