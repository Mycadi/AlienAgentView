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

export type Page = 'agent-view' | 'projects' | 'sessions' | 'terminal' | 'settings';
