// Session types matching Rust backend
export type SessionStatus = 'working' | 'needsinput' | 'error' | 'done';

export interface SessionInfo {
  pid: number;
  sessionId: string;
  cwd: string;
  projectName: string;
  startedAt: number;
  isAlive: boolean;
  status: SessionStatus;
  lastActivity: string | null;
  completedAt: number | null;
  modifiedFiles: string[];
  currentFile: string | null;
  currentTask: string | null;
  totalTokens: number;
  contextPercentage: number;
  elapsedSeconds: number;
  isInteracting: boolean;
}

export interface SessionInput {
  timestamp: string | null;
  content: string;
}

export interface TaskInfo {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks: string[];
  blockedBy: string[];
}

export interface StatsOverview {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  lastComputedDate?: string;
  todayTokens: number;
  todayMessages: number;
  dailyActivity: DailyActivity[];
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  tokens: number;
}

export type ViewMode = 'kanban' | 'list' | 'grid';

export type Language = 'zh-CN' | 'en';

export type Page = 'agent-view' | 'projects' | 'sessions' | 'terminal' | 'chat' | 'stats' | 'settings';

// Chat types matching Rust backend
export interface ChatModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatRole {
  id: string;
  name: string;
  systemPrompt: string;
}

export interface ChatConfig {
  model: ChatModelConfig;
  /** Empty fields fall back to `model`. */
  visionModel: ChatModelConfig;
  roles: ChatRole[];
  defaultRoleId: string;
  /** 0 = keep forever; otherwise drop conversations older than N days. */
  retentionDays: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Base64 data URLs of attached images. */
  images?: string[];
  timestamp?: number | null;
}

export interface ChatConversation {
  id: string;
  title: string;
  roleId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
