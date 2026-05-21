import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ViewMode, Page, Language } from '../types';

interface AppSettings {
  inputFilterWords: string[];
}

interface SettingsState {
  currentPage: Page;
  viewMode: ViewMode;
  language: Language;
  refreshInterval: number; // seconds
  claudeDir: string;
  terminalCommand: string;
  inputFilterWords: string[];

  setPage: (page: Page) => void;
  setViewMode: (mode: ViewMode) => void;
  setLanguage: (language: Language) => void;
  setRefreshInterval: (interval: number) => void;
  setTerminalCommand: (command: string) => void;
  loadAppSettings: () => Promise<void>;
  setInputFilterWords: (words: string[]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  currentPage: 'agent-view',
  viewMode: 'kanban',
  language: 'zh-CN',
  refreshInterval: 3,
  claudeDir: '~/.claude',
  terminalCommand: 'acode',
  inputFilterWords: ['确认', '继续', '改吧'],

  setPage: (page) => set({ currentPage: page }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setLanguage: (language) => set({ language }),
  setRefreshInterval: (interval) => set({ refreshInterval: interval }),
  setTerminalCommand: (command) => set({ terminalCommand: command }),
  loadAppSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      set({ inputFilterWords: settings.inputFilterWords ?? [] });
    } catch {
      // ignore
    }
  },
  setInputFilterWords: async (words) => {
    const settings = await invoke<AppSettings>('set_input_filter_words', { words });
    set({ inputFilterWords: settings.inputFilterWords ?? [] });
  },
}));
