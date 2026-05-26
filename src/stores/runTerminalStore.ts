import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalTab {
  id: string;
  label: string;
  projectKey: string;
  alive: boolean;
}

interface RunTerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  panelOpen: boolean;
  panelHeight: number;

  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelHeight: (h: number) => void;
  setActiveTab: (id: string) => void;
  addTab: (tab: TerminalTab) => void;
  markDead: (id: string) => void;
  closeTab: (id: string) => void;
  closeTabsByProject: (projectKey: string) => void;
}

export const useRunTerminalStore = create<RunTerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,
  panelHeight: 260,

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelHeight: (h: number) => set({ panelHeight: Math.max(120, Math.min(h, 600)) }),

  setActiveTab: (id: string) => set({ activeTabId: id }),

  addTab: (tab: TerminalTab) =>
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      panelOpen: true,
    })),

  markDead: (id: string) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, alive: false } : t)),
    })),

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    invoke('pty_close', { id }).catch(() => {});
    const newTabs = tabs.filter((t) => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
      newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null;
    }
    set({
      tabs: newTabs,
      activeTabId: newActive,
      panelOpen: newTabs.length > 0 ? get().panelOpen : false,
    });
  },

  closeTabsByProject: (projectKey: string) => {
    const { tabs } = get();
    tabs
      .filter((t) => t.projectKey === projectKey)
      .forEach((t) => {
        invoke('pty_close', { id: t.id }).catch(() => {});
      });
    const remaining = tabs.filter((t) => t.projectKey !== projectKey);
    set((s) => ({
      tabs: remaining,
      activeTabId:
        remaining.find((t) => t.id === s.activeTabId)?.id ?? remaining[0]?.id ?? null,
      panelOpen: remaining.length > 0 ? s.panelOpen : false,
    }));
  },
}));

let _exitUnlisten: UnlistenFn | null = null;

export async function initPtyListeners() {
  if (_exitUnlisten) return;
  _exitUnlisten = await listen<{ id: string }>('pty-exit', (event) => {
    useRunTerminalStore.getState().markDead(event.payload.id);
  });
}
