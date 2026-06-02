import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useRunTerminalStore } from './runTerminalStore';

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
  runningTags: Record<string, string[]>;
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
  runningTags: {},
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
    const commands = scripts.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (commands.length === 0) return;

    const termStore = useRunTerminalStore.getState();
    const tags: string[] = [];
    const projectName = key.split('\\').pop() || key;

    for (let i = 0; i < commands.length; i++) {
      if (i > 0 && delaySeconds > 0) {
        await new Promise((r) => setTimeout(r, delaySeconds * 1000));
      }
      const ptyId = await invoke<string>('pty_spawn', {
        path,
        command: commands[i],
        cols: 120,
        rows: 30,
      });
      tags.push(ptyId);
      termStore.addTab({
        id: ptyId,
        label: commands.length > 1 ? `${projectName}:${i + 1}` : projectName,
        projectKey: key,
        alive: true,
      });
    }

    if (tags.length > 0) {
      set((state) => ({ runningTags: { ...state.runningTags, [key]: tags } }));
    }
  },
  stopProject: async (path: string) => {
    const key = normalize(path);
    const tags = get().runningTags[key] ?? [];
    if (tags.length === 0) return;
    await Promise.all(tags.map((id) => invoke('pty_kill', { id })));
    useRunTerminalStore.getState().closeTabsByProject(key);
    set((state) => {
      const runningTags = { ...state.runningTags };
      delete runningTags[key];
      return { runningTags };
    });
  },
}));

export { normalize as normalizeProjectPath };
