import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';
import type { SessionInfo, SessionInput } from '../../types';

export default function SessionsPage() {
  const { sessions } = useClaudeSessions();
  const { language } = useSettingsStore();
  const isZh = language === 'zh-CN';
  const [projectFilter, setProjectFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState('');
  const [projectOptionsOpen, setProjectOptionsOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [sessionInputs, setSessionInputs] = useState<SessionInput[]>([]);
  const [inputsLoading, setInputsLoading] = useState(false);
  const [inputsError, setInputsError] = useState('');

  const normalizedProjectFilter = projectFilter.toLowerCase();
  const hasFilter = projectFilter.trim() || selectedDate;
  const projectOptions = getProjectOptions(sessions);
  const visibleProjectOptions = getVisibleProjectOptions(projectOptions, normalizedProjectFilter);
  const projectMatches = (s: SessionInfo) =>
    !normalizedProjectFilter ||
    s.projectName.toLowerCase().includes(normalizedProjectFilter) ||
    s.cwd.toLowerCase().includes(normalizedProjectFilter);
  const projectFilteredSessions = sessions.filter(projectMatches);
  const availableDates = new Set(
    projectFilteredSessions.map((s) => getDateKey(s.completedAt ?? s.startedAt))
  );
  const latestDate = [...availableDates].sort().at(-1) ?? getDateKey(Date.now());
  const visibleMonth = calendarMonth || latestDate.slice(0, 7);
  const calendarDays = getCalendarDays(visibleMonth);

  const filtered = projectFilteredSessions.filter((s) => {
    const dateMatches =
      !selectedDate ||
      getDateKey(s.completedAt ?? s.startedAt) === selectedDate;

    return dateMatches;
  });

  const sorted = [...filtered].sort(
    (a, b) => b.startedAt - a.startedAt
  );

  const handleProjectChange = (value: string) => {
    setProjectFilter(value);
    if (selectedDate) {
      const nextAvailableDates = new Set(
        sessions
          .filter(
            (s) =>
              !value.toLowerCase() ||
              s.projectName.toLowerCase().includes(value.toLowerCase()) ||
              s.cwd.toLowerCase().includes(value.toLowerCase())
          )
          .map((s) => getDateKey(s.completedAt ?? s.startedAt))
      );
      if (!nextAvailableDates.has(selectedDate)) setSelectedDate('');
    }
  };

  const handleDateChange = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  const openSessionInputs = async (session: SessionInfo) => {
    setSelectedSession(session);
    setSessionInputs([]);
    setInputsError('');
    setInputsLoading(true);
    try {
      const inputs = await invoke<SessionInput[]>('get_session_inputs', {
        cwd: session.cwd,
        sessionId: session.sessionId,
      });
      setSessionInputs(inputs);
    } catch (e) {
      setInputsError(String(e));
    } finally {
      setInputsLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">{isZh ? '会话' : 'Sessions'}</h2>
          <p className="text-sm text-text-muted">
            {isZh ? '所有 Alien Code 会话' : 'All Alien Code sessions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <input
              type="text"
              placeholder={isZh ? '按项目筛选...' : 'Filter by project...'}
              value={projectFilter}
              onFocus={() => setProjectOptionsOpen(true)}
              onBlur={() => window.setTimeout(() => setProjectOptionsOpen(false), 120)}
              onChange={(e) => {
                handleProjectChange(e.target.value);
                setProjectOptionsOpen(true);
              }}
              className="w-full px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-orange/50"
            />
            {projectOptionsOpen && visibleProjectOptions.length > 0 && (
              <div className="absolute left-0 top-11 z-10 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 shadow-xl">
                {visibleProjectOptions.map((project) => (
                  <button
                    key={project.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleProjectChange(project.value);
                      setProjectOptionsOpen(false);
                    }}
                    className="block w-full rounded px-3 py-2 text-left hover:bg-bg-primary transition-colors"
                  >
                    <div className="text-sm font-medium text-text-primary truncate">{project.name}</div>
                    <div className="mt-1 text-xs text-text-muted truncate font-mono">{project.path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((open) => !open)}
              className="px-4 py-2 bg-bg-card border border-border rounded-lg text-sm text-text-primary hover:border-accent-orange/50 transition-colors w-44 text-left"
            >
              {selectedDate ? formatDateLabel(selectedDate) : (isZh ? '选择日期' : 'Select date')}
            </button>
            {calendarOpen && (
              <div className="absolute right-0 top-11 z-10 w-72 rounded-lg border border-border bg-bg-card p-3 shadow-xl">
                <div className="flex items-center justify-between mb-3 text-sm text-text-primary">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(shiftMonth(visibleMonth, -1))}
                    className="px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-glow transition-colors"
                  >
                    ‹
                  </button>
                  <span>{formatMonthLabel(visibleMonth)}</span>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(shiftMonth(visibleMonth, 1))}
                    className="px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-glow transition-colors"
                  >
                    ›
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs text-text-muted">
                  {(isZh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((day, index) => (
                    <div key={`${day}-${index}`}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((dateKey, index) => {
                    const enabled = dateKey ? availableDates.has(dateKey) : false;
                    const selected = dateKey === selectedDate;
                    return dateKey ? (
                      <button
                        key={dateKey}
                        type="button"
                        disabled={!enabled}
                        onClick={() => {
                          handleDateChange(dateKey);
                          setCalendarOpen(false);
                        }}
                        className={`h-8 rounded text-xs transition-colors ${selected ? 'border border-accent-orange/70 bg-accent-orange/10 text-accent-orange' : enabled ? 'border border-border text-text-primary hover:border-border-glow' : 'border border-transparent text-text-muted opacity-30 cursor-not-allowed'}`}
                      >
                        {Number(dateKey.slice(8, 10))}
                      </button>
                    ) : (
                      <div key={`blank-${index}`} />
                    );
                  })}
                </div>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate('');
                      setCalendarOpen(false);
                    }}
                    className="mt-3 w-full px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-glow transition-colors"
                  >
                    {isZh ? '清除日期' : 'Clear date'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          {hasFilter ? (isZh ? '未找到匹配的会话。' : 'No matching sessions found.') : (isZh ? '未找到会话。' : 'No sessions found.')}
        </div>
      ) : (
        <div className="space-y-2 max-w-5xl">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-text-muted uppercase tracking-wider">
            <div className="col-span-1">{isZh ? '状态' : 'Status'}</div>
            <div className="col-span-2">{isZh ? '项目' : 'Project'}</div>
            <div className="col-span-2">{isZh ? '日期' : 'Date'}</div>
            <div className="col-span-3">{isZh ? '当前任务' : 'Current Task'}</div>
            <div className="col-span-2">{isZh ? '文件' : 'File'}</div>
            <div className="col-span-1">Tokens</div>
            <div className="col-span-1">{isZh ? '时间' : 'Time'}</div>
          </div>

          {sorted.map((session) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              isZh={isZh}
              onClick={() => openSessionInputs(session)}
            />
          ))}
        </div>
      )}

      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="bg-bg-card border border-border rounded-xl w-[720px] max-w-[90vw] max-h-[80vh] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-text-primary truncate">
                  {selectedSession.projectName}
                </h3>
                <p className="mt-1 text-xs text-text-muted">
                  {formatSessionDate(selectedSession.completedAt ?? selectedSession.startedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-glow transition-colors"
              >
                {isZh ? '关闭' : 'Close'}
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              {inputsLoading ? (
                <div className="py-12 text-center text-text-muted">{isZh ? '加载中...' : 'Loading...'}</div>
              ) : inputsError ? (
                <div className="py-12 text-center text-red-400">{inputsError}</div>
              ) : sessionInputs.length === 0 ? (
                <div className="py-12 text-center text-text-muted">{isZh ? '未找到输入信息。' : 'No input messages found.'}</div>
              ) : (
                <div className="space-y-3">
                  {sessionInputs.map((input, index) => (
                    <div key={`${input.timestamp ?? 'input'}-${index}`} className="rounded-lg border border-border bg-bg-primary p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-text-muted">
                        <span>#{index + 1}</span>
                        {input.timestamp && <span>{formatInputTimestamp(input.timestamp)}</span>}
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-text-primary leading-6">
                        {input.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({ session, isZh, onClick }: { session: SessionInfo; isZh: boolean; onClick: () => void }) {
  const statusColor = {
    working: 'bg-status-working',
    needsinput: 'bg-status-needs-input',
    error: 'bg-status-error',
    done: 'bg-status-done',
  }[session.status];

  const statusLabel = isZh
    ? {
        working: '工作中',
        needsinput: '需要输入',
        error: '错误',
        done: '已完成',
      }[session.status]
    : {
        working: 'Working',
        needsinput: 'Needs input',
        error: 'Error',
        done: 'Done',
      }[session.status];

  const shortFile = session.currentFile
    ? session.currentFile.replace(/\\/g, '/').split('/').slice(-2).join('/')
    : '-';

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-12 gap-4 px-4 py-3 bg-bg-card border border-border rounded-lg hover:border-border-glow transition-colors text-sm items-center cursor-pointer"
    >
      <div className="col-span-1 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-xs text-text-secondary">{statusLabel}</span>
      </div>
      <div className="col-span-2 text-text-primary truncate font-medium">
        {session.projectName}
      </div>
      <div className="col-span-2 text-text-muted text-xs">
        {formatSessionDate(session.completedAt ?? session.startedAt)}
      </div>
      <div className="col-span-3 text-text-secondary truncate">
        {session.currentTask ?? '-'}
      </div>
      <div className="col-span-2 text-text-muted truncate font-mono text-xs">
        {shortFile}
      </div>
      <div className="col-span-1 text-text-muted text-xs">
        {session.totalTokens > 0
          ? session.totalTokens >= 1000
            ? `${(session.totalTokens / 1000).toFixed(1)}K`
            : session.totalTokens
          : '-'}
      </div>
      <div className="col-span-1 text-text-muted text-xs">
        {formatElapsed(session.elapsedSeconds)}
      </div>
    </div>
  );
}

interface ProjectOption {
  value: string;
  name: string;
  path: string;
}

function getProjectOptions(sessions: SessionInfo[]): ProjectOption[] {
  const byName = new Map<string, Set<string>>();
  for (const session of sessions) {
    const name = session.projectName || session.cwd.split(/[/\\]/).pop() || session.cwd;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(session.cwd);
  }

  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .flatMap(([name, paths]) => {
      const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
      return sortedPaths.map((path) => ({
        value: sortedPaths.length > 1 ? path : name,
        name,
        path,
      }));
    });
}

function getVisibleProjectOptions(projectOptions: ProjectOption[], filter: string): ProjectOption[] {
  return projectOptions.filter(
    (project) =>
      !filter ||
      project.name.toLowerCase().includes(filter) ||
      project.path.toLowerCase().includes(filter)
  );
}

function getDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateLabel(dateKey: string): string {
  return dateKey.replace(/-/g, '/');
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}/${month}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function getCalendarDays(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${year}-${pad(month)}-${pad(index + 1)}`),
  ];
}

function formatInputTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatElapsed(seconds: number): string {
  if (seconds === 0) return '-';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hrs}h ${remainMin}m`;
}
