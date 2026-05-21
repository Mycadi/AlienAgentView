import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface UserProjects {
  added: string[];
  scripts: Record<string, string>;
  script_delays: Record<string, number>;
  urls: Record<string, string>;
}

interface ProjectsState {
  added: string[];
  scripts: Record<string, string>;
  scriptDelays: Record<string, number>;
  urls: Record<string, string>;
  runningPids: Record<string, number[]>;
  load: () => Promise<void>;
  add: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  setScript: (path: string, script: string, delaySeconds: number) => Promise<void>;
  setUrl: (path: string, url: string) => Promise<void>;
  runProject: (path: string) => Promise<void>;
  stopProject: (path: string) => Promise<void>;
}

function normalize(p: string): string {
  return p.trim().replace(/\//g, '\\').replace(/\\+$/, '');
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  added: [],
  scripts: {},
  scriptDelays: {},
  urls: {},
  runningPids: {},
  load: async () => {
    try {
      const data = await invoke<UserProjects>('list_user_projects');
      set({ added: data.added ?? [], scripts: data.scripts ?? {}, scriptDelays: data.script_delays ?? {}, urls: data.urls ?? {} });
    } catch {
      // ignore
    }
  },
  add: async (path: string) => {
    const data = await invoke<UserProjects>('add_user_project', { path });
    set({ added: data.added ?? [], scripts: data.scripts ?? {}, scriptDelays: data.script_delays ?? {}, urls: data.urls ?? {} });
  },
  remove: async (path: string) => {
    const data = await invoke<UserProjects>('remove_user_project', { path });
    set({ added: data.added ?? [], scripts: data.scripts ?? {}, scriptDelays: data.script_delays ?? {}, urls: data.urls ?? {} });
  },
  setScript: async (path: string, script: string, delaySeconds: number) => {
    const data = await invoke<UserProjects>('set_project_script', { path, script, delaySeconds });
    set({ added: data.added ?? [], scripts: data.scripts ?? {}, scriptDelays: data.script_delays ?? {}, urls: data.urls ?? {} });
  },
  setUrl: async (path: string, url: string) => {
    const data = await invoke<UserProjects>('set_project_url', { path, url });
    set({ added: data.added ?? [], scripts: data.scripts ?? {}, scriptDelays: data.script_delays ?? {}, urls: data.urls ?? {} });
  },
  runProject: async (path: string) => {
    const key = normalize(path);
    const scripts = get().scripts[key] ?? '';
    const delaySeconds = get().scriptDelays[key] ?? 0;
    const pids = await invoke<number[]>('run_project', { path, scripts, delaySeconds });
    if (pids.length > 0) {
      set((state) => ({ runningPids: { ...state.runningPids, [key]: pids } }));
    }
  },
  stopProject: async (path: string) => {
    const key = normalize(path);
    const pids = get().runningPids[key] ?? [];
    if (pids.length === 0) return;
    await Promise.all(pids.map((pid) => invoke('stop_project', { pid })));
    set((state) => {
      const runningPids = { ...state.runningPids };
      delete runningPids[key];
      return { runningPids };
    });
  },
}));

export { normalize as normalizeProjectPath };
