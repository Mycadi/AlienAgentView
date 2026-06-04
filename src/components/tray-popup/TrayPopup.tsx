import '../../styles/globals.css';
import { useEffect, useRef, useState } from 'react';
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
  const contentRef = useRef<HTMLDivElement>(null);

  // 测量真实 DOM 高度来设置窗口大小
  useEffect(() => {
    requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const height = Math.ceil(contentRef.current.getBoundingClientRect().height) + 16;
      getCurrentWindow().setSize(new LogicalSize(240, height));
    });
  }, [sessions]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const all = await invoke<SessionInfo[]>('get_sessions');
        setSessions(
          all
            .filter((s) => s.status === 'needsinput')
            .sort((a, b) => (a.projectName || a.cwd).localeCompare(b.projectName || b.cwd, 'en'))
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

    const unlisten = listen('claude-sessions-changed', fetchSessions);
    const timer = setInterval(fetchSessions, 3000);

    return () => {
      unlisten.then((fn) => fn());
      clearInterval(timer);
    };
  }, []);

  const handleClick = async (session: TrayPopupSession) => {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('navigate-to-terminal', { sessionId: session.sessionId });

    try {
      await invoke('focus_window_by_session_id', { sessionId: session.sessionId });
    } catch {
      if (session.pid > 0) {
        await invoke('focus_session_window', { pid: session.pid }).catch(() => {});
      }
    }

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
      ref={contentRef}
      className="bg-transparent"
      onMouseLeave={async () => {
        const popup = getCurrentWindow();
        await popup.hide();
      }}
    >
      <div className="mx-2 my-2 rounded-xl overflow-hidden glass-panel border border-border/60">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="" className="w-4 h-4 shrink-0" draggable={false} />
            <span className="text-xs font-medium text-text-secondary truncate">AlienAgentView</span>
          </div>
          <button
            onClick={handleStopFlash}
            className="text-xs text-text-muted hover:text-accent-orange transition-colors cursor-pointer"
          >
            取消闪动
          </button>
        </div>

        {/* 消息列表 */}
        {sessions.length === 0 ? (
          <div className="px-4 py-4 text-center text-text-muted text-xs">
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
  );
}
