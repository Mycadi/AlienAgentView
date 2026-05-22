import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProjectsStore, normalizeProjectPath } from '../../stores/projectsStore';
import type { SessionInfo } from '../../types';

export default function ProjectsPage() {
  const { sessions, stats } = useClaudeSessions();
  const { language, terminalCommand } = useSettingsStore();
  const { added, scripts, scriptDelays, urls, runningPids, load, add, remove, setScript, setUrl, runProject, stopProject } = useProjectsStore();
  const isZh = language === 'zh-CN';
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [scriptTarget, setScriptTarget] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState('');
  const [delayDraft, setDelayDraft] = useState(0);
  const [urlDraft, setUrlDraft] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  // Only show manually added projects, associate sessions by cwd
  const sessionsByProject = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = s.cwd;
    if (!sessionsByProject.has(key)) sessionsByProject.set(key, []);
    sessionsByProject.get(key)!.push(s);
  }
  const projects = new Map<string, SessionInfo[]>();
  for (const p of added) {
    const matched = sessionsByProject.get(p)
      ?? [...sessionsByProject.entries()].find(([k]) => normalizeProjectPath(k) === normalizeProjectPath(p))?.[1]
      ?? [];
    projects.set(p, matched);
  }

  const handleAdd = async () => {
    setError('');
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: isZh ? '选择项目目录' : 'Select project folder',
      });
      if (!selected || typeof selected !== 'string') return;
      await add(selected);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (path: string) => {
    try {
      await remove(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRun = async (path: string) => {
    setError('');
    try {
      await runProject(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async (path: string) => {
    setError('');
    try {
      await stopProject(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const openScriptEditor = (path: string) => {
    const key = normalizeProjectPath(path);
    setScriptTarget(path);
    setScriptDraft(scripts[key] ?? '');
    setDelayDraft(scriptDelays[key] ?? 0);
    setUrlDraft(urls[key] ?? '');
  };

  const saveScript = async () => {
    if (!scriptTarget) return;
    try {
      await setScript(scriptTarget, scriptDraft, delayDraft);
      await setUrl(scriptTarget, urlDraft);
      setScriptTarget(null);
      setScriptDraft('');
      setDelayDraft(0);
      setUrlDraft('');
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <h2 className="text-xl font-bold text-text-primary mb-1">
        {isZh ? '项目' : 'Projects'}
        <span className="ml-2 text-sm font-normal text-text-muted">{projects.size}</span>
      </h2>
      <p className="text-sm text-text-muted mb-4">
        {isZh ? '所有包含 Alien Code 活动的项目' : 'All projects with Alien Code activity'}
      </p>

      <div className="flex items-center gap-2 mb-2 max-w-5xl">
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-glow transition-colors"
        >
          {isZh ? '添加项目' : 'Add Project'}
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mb-2 max-w-5xl">{error}</div>}
      <div className="mb-6" />

      {projects.size === 0 ? (
        <div className="text-center py-16 text-text-muted">
          {isZh ? '未找到项目。' : 'No projects found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
          {[...projects.entries()]
            .sort(([a], [b]) => {
              const na = a.split(/[/\\]/).pop() ?? a;
              const nb = b.split(/[/\\]/).pop() ?? b;
              return na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true });
            })
            .map(([cwd, projectSessions]) => {
            const name = cwd.split(/[/\\]/).pop() ?? cwd;
            const working = projectSessions.filter(
              (s) => s.status === 'working'
            ).length;
            const totalTokens = projectSessions.reduce(
              (sum, s) => sum + s.totalTokens,
              0
            );
            const projectKey = normalizeProjectPath(cwd);
            const scriptText = scripts[projectKey] ?? '';
            const isRunning = (runningPids[projectKey]?.length ?? 0) > 0;
            const hasScript = scriptText.split('\n').some((line) => line.trim());
            const projectUrl = urls[projectKey] ?? '';
            const hasUrl = projectUrl.trim().length > 0;

            return (
              <div
                key={cwd}
                className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-glow transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg">📁</span>
                  <h3 className="text-sm font-medium text-text-primary">
                    {name}
                  </h3>
                  {working > 0 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-status-working/10 text-status-working">
                      {isZh ? `${working} 个活跃` : `${working} active`}
                    </span>
                  )}
                  <button
                    type="button"
                    title={hasUrl ? (isZh ? '打开项目网址' : 'Open project URL') : (isZh ? '未配置网址' : 'No URL configured')}
                    disabled={!hasUrl}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasUrl) openUrl(projectUrl).catch(() => {});
                    }}
                    className="ml-auto px-2 py-0.5 text-xs rounded border border-border text-text-muted hover:text-accent-orange hover:border-accent-orange disabled:opacity-40 disabled:hover:text-text-muted disabled:hover:border-border transition-colors"
                  >
                    🔗
                  </button>
                  <button
                    type="button"
                    title={isZh ? '打开目录' : 'Open folder'}
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke('open_folder', { path: cwd }).catch(() => {});
                    }}
                    className="px-2 py-0.5 text-xs rounded border border-border text-text-muted hover:text-text-primary hover:border-border-glow transition-colors"
                  >
                    {isZh ? '打开' : 'Open'}
                  </button>
                  <button
                    type="button"
                    title={isZh ? '在此目录启动终端' : 'Open terminal here'}
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke('open_terminal', { path: cwd, command: terminalCommand }).catch(() => {});
                    }}
                    className="px-2 py-0.5 text-xs rounded border border-border text-text-muted hover:text-accent-orange hover:border-accent-orange transition-colors"
                  >
                    Coding
                  </button>
                  <button
                    type="button"
                    title={isZh ? '从列表移除' : 'Remove from list'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmTarget(cwd);
                    }}
                    className="px-2 py-0.5 text-xs rounded border border-border text-text-muted hover:text-red-400 hover:border-red-400 transition-colors"
                  >
                    {isZh ? '移除' : 'Remove'}
                  </button>
                </div>
                <div className="text-xs text-text-muted mb-3 font-mono truncate">
                  {cwd}
                </div>
                <div className="flex items-center justify-between gap-4 text-xs text-text-secondary">
                  <div className="flex gap-4">
                    <span>{isZh ? `${projectSessions.length} 个会话` : `${projectSessions.length} sessions`}</span>
                    <span>
                      {totalTokens >= 1000
                        ? `${(totalTokens / 1000).toFixed(1)}K`
                        : totalTokens}{' '}
                      Tokens
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title={isZh ? '运行项目' : 'Run project'}
                      disabled={!hasScript || isRunning}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRun(cwd);
                      }}
                      className="text-sm text-text-muted hover:text-status-working disabled:opacity-40 disabled:hover:text-text-muted transition-colors"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      title={isZh ? '停止项目' : 'Stop project'}
                      disabled={!isRunning}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStop(cwd);
                      }}
                      className="text-sm text-text-muted hover:text-red-400 disabled:opacity-40 disabled:hover:text-text-muted transition-colors"
                    >
                      ■
                    </button>
                    <button
                      type="button"
                      title={isZh ? '编辑运行脚本' : 'Edit run script'}
                      onClick={(e) => {
                        e.stopPropagation();
                        openScriptEditor(cwd);
                      }}
                      className="text-sm text-text-muted hover:text-accent-orange transition-colors"
                    >
                      ✎
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats summary */}
      {stats && (
        <div className="mt-8 p-5 bg-bg-card border border-border rounded-xl max-w-5xl">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-medium text-text-primary">
              {isZh ? '累计统计' : 'Lifetime Stats'}
            </h3>
            {stats.lastComputedDate && (
              <span className="text-xs text-text-muted">
                {isZh ? `数据截至 ${stats.lastComputedDate}` : `As of ${stats.lastComputedDate}`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
            <StatItem label={isZh ? '总会话' : 'Total Sessions'} value={stats.totalSessions} />
            <StatItem label={isZh ? '总消息' : 'Total Messages'} value={stats.totalMessages} />
            <StatItem
              label={isZh ? '输入 Tokens' : 'Input Tokens'}
              value={formatNum(stats.totalInputTokens)}
            />
            <StatItem
              label={isZh ? '输出 Tokens' : 'Output Tokens'}
              value={formatNum(stats.totalOutputTokens)}
            />
            <StatItem
              label={isZh ? '缓存读取' : 'Cache Read'}
              value={formatNum(stats.totalCacheReadTokens)}
            />
            <StatItem
              label={isZh ? '缓存创建' : 'Cache Create'}
              value={formatNum(stats.totalCacheCreationTokens)}
            />
          </div>
        </div>
      )}

      {scriptTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setScriptTarget(null)}
        >
          <div
            className="bg-bg-card border border-border rounded-xl p-5 w-[520px] max-w-[90vw] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary mb-2">
              {isZh ? '编辑运行脚本' : 'Edit Run Script'}
            </h3>
            <p className="text-xs text-text-muted font-mono break-all mb-3">
              {scriptTarget}
            </p>
            <label className="block text-xs text-text-muted mb-3">
              <span className="block mb-1">{isZh ? '项目网址' : 'Project URL'}</span>
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors"
              />
            </label>
            <p className="text-xs text-text-secondary mb-3">
              {isZh ? '每行一个命令；程序会按启动间隔依次打开 cmd 窗口。' : 'One command per line. The app opens cmd windows in sequence using the launch interval.'}
            </p>
            <textarea
              value={scriptDraft}
              onChange={(e) => setScriptDraft(e.target.value)}
              placeholder={isZh ? '例如：\nnpm run dev\ncd server && npm run dev' : 'Example:\nnpm run dev\ncd server && npm run dev'}
              rows={6}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors mb-3 resize-y"
            />
            <label className="block text-xs text-text-muted mb-5">
              <span className="block mb-1">{isZh ? '启动间隔（秒）' : 'Launch Interval (seconds)'}</span>
              <input
                type="number"
                min="0"
                value={delayDraft}
                onChange={(e) => setDelayDraft(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScriptTarget(null)}
                className="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-glow transition-colors"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={saveScript}
                className="px-3 py-1.5 text-xs rounded border border-accent-orange/60 text-accent-orange hover:bg-accent-orange/10 transition-colors"
              >
                {isZh ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmTarget(null)}
        >
          <div
            className="bg-bg-card border border-border rounded-xl p-5 w-[420px] max-w-[90vw] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary mb-2">
              {isZh ? '移除项目' : 'Remove Project'}
            </h3>
            <p className="text-xs text-text-secondary mb-2">
              {isZh ? '确定从列表移除该项目？' : 'Remove this project from the list?'}
            </p>
            <p className="text-xs text-text-muted font-mono break-all mb-5">
              {confirmTarget}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-glow transition-colors"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmTarget;
                  setConfirmTarget(null);
                  handleRemove(target);
                }}
                className="px-3 py-1.5 text-xs rounded border border-red-400/60 text-red-400 hover:bg-red-400/10 transition-colors"
              >
                {isZh ? '确认移除' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-lg font-bold text-text-primary">{value}</div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
