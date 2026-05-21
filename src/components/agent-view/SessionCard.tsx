import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { SessionInfo } from '../../types';

interface Props { session: SessionInfo; }

export default function SessionCard({ session }: Props) {
  const { focusSessionWindow } = useSessionStore();
  const { language } = useSettingsStore();
  const [showModifiedFiles, setShowModifiedFiles] = useState(false);
  const isZh = language === 'zh-CN';
  const elapsed = formatElapsed(session.elapsedSeconds, isZh);
  const file = session.currentFile ? shortenPath(session.currentFile) : shortenPath(session.cwd);
  const title = session.projectName || (session.currentTask ?? sampleTitle(session.status));
  const dotStyle = getDotStyle(session.status, session.isInteracting);

  return (
    <article
      className="card-shadow rounded-[9px] border border-[#202532] bg-[#181b22] px-[16px] py-[13px] hover:border-[#31384a] transition-colors cursor-pointer"
      onClick={() => {
        if (session.status === 'done') {
          setShowModifiedFiles((value) => !value);
          return;
        }
        focusSessionWindow(session.sessionId);
      }}
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex items-start gap-[11px] min-w-0">
          <CardIcon status={session.status} />
          <div className="min-w-0">
            <div className="text-[14px] leading-[18px] font-semibold text-text-primary truncate">{title}</div>
            <div className="mt-[4px] text-[12px] leading-[16px] text-text-secondary truncate">
              <span>{getStatusLabel(session.status, isZh)}</span>
              <span className="mx-[7px] text-text-muted">·</span>
              <span className="text-text-muted">{file}</span>
            </div>
            {session.status === 'done' && session.completedAt && (
              <div className="mt-[2px] text-[12px] leading-[16px] text-text-muted truncate">
                {formatTimestamp(session.completedAt)}
              </div>
            )}
            {session.status === 'done' && showModifiedFiles && (
              <div className="mt-[6px] space-y-[3px] text-[12px] leading-[16px] text-text-muted">
                {session.modifiedFiles.length ? session.modifiedFiles.map((file) => (
                  <div key={file} className="truncate">{shortenPath(file)}</div>
                )) : (
                  <div>{isZh ? '无修改文件' : 'No modified files'}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-[12px] shrink-0">
          {elapsed && <span className="text-[12px] leading-[16px] text-text-muted">{elapsed}</span>}
          {dotStyle && (
            <span
              className={`w-[8px] h-[8px] rounded-full ${dotStyle.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: dotStyle.backgroundColor, boxShadow: dotStyle.boxShadow }}
            />
          )}
        </div>
      </div>

      {session.status === 'working' && (
        <div
          className="mt-[11px] ml-[28px] h-[3px] rounded-full bg-[#202532] overflow-hidden"
          title={`/context ${session.contextPercentage}%`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3f63c7] to-[#85b6ff]"
            style={{ width: `${session.contextPercentage}%` }}
          />
        </div>
      )}

      {session.status === 'needsinput' && (
        <div className="mt-[10px] ml-[28px] rounded-[4px] bg-[#211a0f] border border-[#332711] px-[11px] py-[7px] text-[12px] leading-[16px] text-[#d6b37d] truncate">
          {session.lastActivity ?? sampleQuestion(title)}
        </div>
      )}
    </article>
  );
}

function getDotStyle(status: string, isInteracting: boolean) {
  if (status === 'error') {
    return {
      backgroundColor: '#ef4444',
      boxShadow: '0 0 8px rgba(239,68,68,0.75)',
      pulse: false,
    };
  }
  if (status !== 'working') return null;
  if (isInteracting) {
    return {
      backgroundColor: '#57b86a',
      boxShadow: '0 0 8px rgba(87,184,106,0.75)',
      pulse: true,
    };
  }
  return {
    backgroundColor: '#5f6675',
    boxShadow: 'none',
    pulse: false,
  };
}

function CardIcon({ status }: { status: string }) {
  if (status === 'working') return <span className="mt-[2px] w-[18px] h-[18px] shrink-0 flex items-center justify-center text-[13px] font-bold font-mono text-[#5579df]">&lt;/&gt;</span>;
  if (status === 'error') return <span className="mt-[1px] w-[18px] h-[18px] shrink-0 rounded-full border border-status-error text-status-error text-[12px] font-bold flex items-center justify-center">!</span>;
  if (status === 'needsinput') return <span className="mt-[1px] w-[18px] h-[18px] shrink-0 rounded-full border border-status-needs-input text-status-needs-input text-[12px] font-bold flex items-center justify-center">?</span>;
  return <span className="mt-[1px] w-[18px] h-[18px] shrink-0 rounded-full border border-status-done text-status-done flex items-center justify-center"><svg className="w-[12px] h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.5 8.2 6.4 11 12.8 4.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

function getStatusLabel(status: string, isZh: boolean): string {
  if (status === 'working') return isZh ? '工作中' : 'Coding';
  if (status === 'error') return isZh ? '报错' : 'Error';
  if (status === 'needsinput') return isZh ? '需要输入' : 'Needs input';
  return isZh ? '已完成' : 'Completed';
}

function formatElapsed(seconds: number, isZh: boolean): string {
  if (!seconds) return '';
  if (seconds < 60) return isZh ? `${seconds} 秒前` : `${seconds}s ago`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return isZh ? `${min} 分钟前` : `${min}m ago`;
  const hours = Math.floor(min / 60);
  return isZh ? `${hours} 小时前` : `${hours}h ago`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}


function sampleTitle(status: string) {
  if (status === 'working') return 'Implement auth middleware';
  if (status === 'needsinput') return 'Design system color decision';
  return 'Fix login page responsive issue';
}

function sampleQuestion(title: string) {
  if (title.toLowerCase().includes('color')) return '选择主要色调方案？是否使用 Brand Blue #2563eb?';
  if (title.toLowerCase().includes('review')) return '请 review 代码变更并提供反馈';
  return '需要确认迁移计划？以及是否需要生产备份';
}
