import '../../styles/globals.css';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import type { SessionInfo } from '../../types';

interface TrayPopupSession {
  sessionId: string;
  projectName: string;
  cwd: string;
  pid: number;
}

export default function TrayPopup() {
  const [sessions, setSessions] = useState<TrayPopupSession[]>([]);

  // 根据条目数动态调整窗口高度
  useEffect(() => {
    const popup = getCurrentWindow();
    const headerHeight = 36;  // 标题栏
    const itemHeight = 40;    // 每个条目
    const padding = 16;       // 上下边距 + 圆角留白
    const count = Math.max(sessions.length, 1); // 至少1条（空状态）
    const height = headerHeight + itemHeight * count + padding;
    const maxHeight = 400;
    popup.setSize(new LogicalSize(360, Math.min(height, maxHeight)));
  }, [sessions]);

  useEffect(() => {
    // 每次弹窗可见时刷新 session 列表
    const fetchSessions = async () => {
      try {
        const all = await invoke<SessionInfo[]>('get_sessions');
        setSessions(
          all
            .filter((s) => s.status === 'needsinput')
            .map((s) => ({
              sessionId: s.sessionId,
              projectName: s.projectName,
              cwd: s.cwd,
              pid: s.pid,
            }))
        );
      } catch {
        // ignore
      }
    };

    fetchSessions();

    // 监听 sessions 变化自动刷新
    const unlisten = listen('claude-sessions-changed', fetchSessions);
    const timer = setInterval(fetchSessions, 3000);

    return () => {
      unlisten.then((fn) => fn());
      clearInterval(timer);
    };
  }, []);

  const handleClick = async (session: TrayPopupSession) => {
    // 通知主窗口跳转到终端页
    const { emit } = await import('@tauri-apps/api/event');
    await emit('navigate-to-terminal', { sessionId: session.sessionId });

    // 聚焦对应的 session 窗口
    try {
      await invoke('focus_window_by_session_id', { sessionId: session.sessionId });
    } catch {
      if (session.pid > 0) {
        await invoke('focus_session_window', { pid: session.pid }).catch(() => {});
      }
    }

    // 隐藏弹窗，停止闪烁，显示主窗口
    await invoke('stop_tray_flash').catch(() => {});
    const popup = getCurrentWindow();
    await popup.hide();
  };

  const handleStopFlash = async () => {
    await invoke('stop_tray_flash').catch(() => {});
    const popup = getCurrentWindow();
    await popup.hide();
  };

  return (
    <div
      className="w-full h-full bg-transparent flex flex-col"
      onMouseLeave={async () => {
        const popup = getCurrentWindow();
        await popup.hide();
      }}
    >
      <div className="mx-2 mb-2 mt-2 rounded-xl overflow-hidden glass-panel border border-border/60 flex flex-col max-h-full">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-secondary">AlienAgentView</span>
          </div>
          <button
            onClick={handleStopFlash}
            className="text-xs text-text-muted hover:text-accent-orange transition-colors cursor-pointer"
          >
            取消闪动
          </button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted text-xs">
              暂无等待输入的会话
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => handleClick(session)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-bg-card-hover cursor-pointer transition-colors border-b border-border/20 last:border-b-0"
              >
                <div className="w-2 h-2 rounded-full bg-status-needs-input shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">
                    {session.projectName || session.cwd}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">等待输入</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
