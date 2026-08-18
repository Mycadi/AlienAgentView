import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ChatConfig, ChatConversation, ChatMessage, ChatRole } from '../types';

interface StreamPayload {
  convId: string;
  delta: string;
  done: boolean;
}

interface ErrorPayload {
  convId: string;
  message: string;
}

const emptyConfig: ChatConfig = {
  model: { baseUrl: 'https://api.openai.com', apiKey: '', model: 'gpt-4o-mini' },
  visionModel: { baseUrl: '', apiKey: '', model: '' },
  roles: [],
  defaultRoleId: '',
  retentionDays: 0,
};

interface ChatState {
  config: ChatConfig;
  conversations: ChatConversation[];
  currentId: string | null;
  streaming: boolean;
  error: string;

  loadConfig: () => Promise<void>;
  updateModel: (model: ChatConfig['model']) => Promise<void>;
  updateVisionModel: (visionModel: ChatConfig['model']) => Promise<void>;
  updateRetention: (retentionDays: number) => Promise<void>;
  saveRoles: (roles: ChatRole[], defaultRoleId: string) => Promise<void>;

  loadConversations: () => Promise<void>;
  newConversation: (roleId?: string) => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentRole: (roleId: string) => void;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persist(conv: ChatConversation) {
  invoke('save_chat_conversation', { conversation: conv }).catch(() => {});
}

export const useChatStore = create<ChatState>((set, get) => ({
  config: emptyConfig,
  conversations: [],
  currentId: null,
  streaming: false,
  error: '',

  loadConfig: async () => {
    try {
      const config = await invoke<ChatConfig>('get_chat_config');
      set({ config: { ...emptyConfig, ...config } });
    } catch {
      // ignore
    }
  },

  updateModel: async (model) => {
    const config = await invoke<ChatConfig>('update_chat_config', { model });
    set({ config: { ...emptyConfig, ...config } });
  },

  updateVisionModel: async (visionModel) => {
    const config = await invoke<ChatConfig>('update_chat_config', { visionModel });
    set({ config: { ...emptyConfig, ...config } });
  },

  updateRetention: async (retentionDays) => {
    const config = await invoke<ChatConfig>('update_chat_config', { retentionDays });
    set({ config: { ...emptyConfig, ...config } });
  },

  saveRoles: async (roles, defaultRoleId) => {
    const config = await invoke<ChatConfig>('update_chat_config', { roles, defaultRoleId });
    set({ config: { ...emptyConfig, ...config } });
  },

  loadConversations: async () => {
    try {
      const list = await invoke<ChatConversation[]>('get_chat_conversations');
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ conversations: list });
      if (!get().currentId && list.length > 0) {
        set({ currentId: list[0].id });
      }
    } catch {
      // ignore
    }
  },

  newConversation: (roleId) => {
    const { config } = get();
    const now = Date.now();
    const conv: ChatConversation = {
      id: uid(),
      title: '新对话',
      roleId: roleId ?? config.defaultRoleId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    // Drop other empty (unsent) conversations so opening Chat repeatedly
    // doesn't pile up blank drafts.
    set((s) => ({
      conversations: [conv, ...s.conversations.filter((c) => c.messages.length > 0)],
      currentId: conv.id,
      error: '',
    }));
  },

  selectConversation: (id) => set({ currentId: id, error: '' }),

  deleteConversation: async (id) => {
    await invoke('delete_chat_conversation', { id }).catch(() => {});
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const currentId = s.currentId === id ? (conversations[0]?.id ?? null) : s.currentId;
      return { conversations, currentId };
    });
  },

  setCurrentRole: (roleId) => {
    const { currentId } = get();
    if (!currentId) return;
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === currentId ? { ...c, roleId } : c
      ),
    }));
    const conv = get().conversations.find((c) => c.id === currentId);
    if (conv) persist(conv);
  },

  sendMessage: async (content, images) => {
    const text = content.trim();
    const pics = images ?? [];
    if ((!text && pics.length === 0) || get().streaming) return;

    let { currentId } = get();
    if (!currentId) {
      get().newConversation();
      currentId = get().currentId;
    }
    if (!currentId) return;

    const now = Date.now();
    const userMsg: ChatMessage = { role: 'user', content: text, images: pics, timestamp: now };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: now };

    // Append user message + empty assistant placeholder.
    set((s) => ({
      streaming: true,
      error: '',
      conversations: s.conversations.map((c) => {
        if (c.id !== currentId) return c;
        const isFirst = c.messages.length === 0;
        const title = text ? text.slice(0, 20) : '[图片]';
        return {
          ...c,
          title: isFirst ? title : c.title,
          messages: [...c.messages, userMsg, assistantMsg],
          updatedAt: now,
        };
      }),
    }));

    const conv = get().conversations.find((c) => c.id === currentId);
    if (!conv) {
      set({ streaming: false });
      return;
    }

    // Send all messages except the trailing empty assistant placeholder.
    const payloadMessages = conv.messages.slice(0, -1);

    try {
      await invoke('chat_send', {
        convId: currentId,
        roleId: conv.roleId,
        messages: payloadMessages,
      });
    } catch (e) {
      set((s) => ({
        streaming: false,
        error: String(e),
        conversations: s.conversations.map((c) => {
          if (c.id !== currentId) return c;
          // Drop the empty assistant placeholder on immediate failure.
          const messages = [...c.messages];
          if (messages.length && messages[messages.length - 1].content === '') {
            messages.pop();
          }
          return { ...c, messages };
        }),
      }));
      const failed = get().conversations.find((c) => c.id === currentId);
      if (failed) persist(failed);
    }
  },
}));

let listenersReady = false;

/** Register global chat stream listeners once. Call from App bootstrap. */
export function initChatListeners() {
  if (listenersReady) return;
  listenersReady = true;

  listen<StreamPayload>('chat-stream', (event) => {
    const { convId, delta, done } = event.payload;
    useChatStore.setState((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content: last.content + delta };
        }
        return { ...c, messages, updatedAt: Date.now() };
      }),
      streaming: done ? false : s.streaming,
    }));
    if (done) {
      const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
      if (conv) invoke('save_chat_conversation', { conversation: conv }).catch(() => {});
    }
  });

  listen<ErrorPayload>('chat-error', (event) => {
    const { convId, message } = event.payload;
    useChatStore.setState((s) => ({
      streaming: false,
      error: message,
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          messages.pop();
        }
        return { ...c, messages };
      }),
    }));
  });
}
