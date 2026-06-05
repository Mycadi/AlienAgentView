import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ViewMode, Page, Language } from '../types';

interface AppSettings {
  inputFilterWords: string[];
  language: Language;
  refreshInterval: number;
  terminalCommand: string;
  claudeDir: string;
  mutedSessions: string[];
}

interface SettingsState {
  currentPage: Page;
  viewMode: ViewMode;
  language: Language;
  refreshInterval: number; // seconds
  claudeDir: string;
  terminalCommand: string;
  inputFilterWords: string[];
  mutedSessions: string[];

  setPage: (page: Page) => void;
  setViewMode: (mode: ViewMode) => void;
  setLanguage: (language: Language) => Promise<void>;
  setRefreshInterval: (interval: number) => Promise<void>;
  setTerminalCommand: (command: string) => Promise<void>;
  setClaudeDir: (dir: string) => Promise<void>;
  loadAppSettings: () => Promise<void>;
  setInputFilterWords: (words: string[]) => Promise<void>;
  addMutedSession: (sessionId: string) => Promise<void>;
  removeMutedSession: (sessionId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  currentPage: 'agent-view',
  viewMode: 'kanban',
  language: 'zh-CN',
  refreshInterval: 3,
  claudeDir: '~/.claude',
  terminalCommand: 'acode',
  inputFilterWords: ['确认', '继续', '改吧'],
  mutedSessions: [],

  setPage: (page) => set({ currentPage: page }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setLanguage: async (language) => {
    set({ language });
    const settings = await invoke<AppSettings>('update_app_settings', { language });
    set({ language: settings.language as Language });
  },
  setRefreshInterval: async (interval) => {
    set({ refreshInterval: interval });
    const settings = await invoke<AppSettings>('update_app_settings', { refreshInterval: interval });
    set({ refreshInterval: settings.refreshInterval });
  },
  setTerminalCommand: async (command) => {
    set({ terminalCommand: command });
    const settings = await invoke<AppSettings>('update_app_settings', { terminalCommand: command });
    set({ terminalCommand: settings.terminalCommand });
  },
  setClaudeDir: async (dir) => {
    set({ claudeDir: dir });
    const settings = await invoke<AppSettings>('update_app_settings', { claudeDir: dir });
    set({ claudeDir: settings.claudeDir });
  },
  loadAppSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      set({
        inputFilterWords: settings.inputFilterWords ?? [],
        mutedSessions: settings.mutedSessions ?? [],
        language: (settings.language as Language) ?? 'zh-CN',
        refreshInterval: settings.refreshInterval ?? 3,
        terminalCommand: settings.terminalCommand || 'acode',
        claudeDir: settings.claudeDir ?? '~/.claude',
      });
    } catch {
      // ignore
    }
  },
  setInputFilterWords: async (words) => {
    const settings = await invoke<AppSettings>('update_app_settings', { inputFilterWords: words });
    set({ inputFilterWords: settings.inputFilterWords ?? [] });
  },
  addMutedSession: async (sessionId) => {
    const current = useSettingsStore.getState().mutedSessions;
    if (current.includes(sessionId)) return;
    const next = [...current, sessionId];
    const settings = await invoke<AppSettings>('update_app_settings', { mutedSessions: next });
    set({ mutedSessions: settings.mutedSessions ?? [] });
  },
  removeMutedSession: async (sessionId) => {
    const current = useSettingsStore.getState().mutedSessions;
    const next = current.filter((id) => id !== sessionId);
    const settings = await invoke<AppSettings>('update_app_settings', { mutedSessions: next });
    set({ mutedSessions: settings.mutedSessions ?? [] });
  },
}));
