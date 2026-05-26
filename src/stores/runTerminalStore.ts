import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
    ptyOutputRouter.remove(id);
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
        ptyOutputRouter.remove(t.id);
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

// ── Centralized PTY output routing ──────────────────────────────────
// Single global listener dispatches to per-id writers.
// Before a writer is registered, data is buffered so nothing is lost.

type PtyWriter = (data: Uint8Array) => void;

class PtyOutputRouter {
  private writers = new Map<string, PtyWriter>();
  private buffers = new Map<string, Uint8Array[]>();

  /** Start buffering for a pty id (call right after pty_spawn). */
  startBuffering(id: string) {
    this.buffers.set(id, []);
  }

  /** Register a writer. Replays any buffered data, then routes live. */
  register(id: string, writer: PtyWriter) {
    // Replay buffer
    const buf = this.buffers.get(id);
    if (buf) {
      for (const chunk of buf) {
        writer(chunk);
      }
      this.buffers.delete(id);
    }
    this.writers.set(id, writer);
  }

  /** Unregister writer and clean up buffer. */
  remove(id: string) {
    this.writers.delete(id);
    this.buffers.delete(id);
  }

  /** Called by the global event listener for every pty-output event. */
  dispatch(id: string, data: Uint8Array) {
    const writer = this.writers.get(id);
    if (writer) {
      writer(data);
      return;
    }
    // No writer yet — auto-buffer
    let buf = this.buffers.get(id);
    if (!buf) {
      buf = [];
      this.buffers.set(id, buf);
    }
    buf.push(data);
  }
}

export const ptyOutputRouter = new PtyOutputRouter();

// ── Global listeners (call once at app init) ────────────────────────

let _inited = false;

export async function initPtyListeners() {
  if (_inited) return;
  _inited = true;
  await listen<{ id: string }>('pty-exit', (event) => {
    useRunTerminalStore.getState().markDead(event.payload.id);
  });
  await listen<{ id: string; data: number[] }>('pty-output', (event) => {
    ptyOutputRouter.dispatch(event.payload.id, new Uint8Array(event.payload.data));
  });
}
