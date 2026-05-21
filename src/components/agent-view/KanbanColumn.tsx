import type { ReactNode } from 'react';
import type { SessionInfo, SessionStatus } from '../../types';
import SessionCard from './SessionCard';

interface Props {
  title: string;
  subtitle: string;
  status: SessionStatus;
  sessions: SessionInfo[];
  dotColor: string;
  titleColor: string;
}

export default function KanbanColumn({ title, subtitle, status, sessions, dotColor, titleColor }: Props) {
  const displaySessions = status === 'working'
    ? [...sessions].sort(compareSessionByProjectName)
    : sessions;

  return (
    <section className="flex-1 min-w-0 rounded-[12px] glass-panel p-[18px] flex flex-col overflow-hidden">
      <div className="flex items-center gap-[10px] mb-[4px]">
        <StatusRing status={status} className={dotColor} />
        <h2 className={`text-[18px] leading-[22px] font-bold tracking-[-0.02em] ${titleColor}`}>{title}</h2>
        <span className="ml-[4px] text-[16px] font-semibold text-text-secondary">{displaySessions.length}</span>
      </div>
      <p className="ml-[31px] mb-[15px] text-[12px] leading-[16px] text-text-secondary">{subtitle}</p>

      <div className="space-y-[10px] overflow-y-auto pr-[2px]">
        {displaySessions.length ? displaySessions.map((session) => <SessionCard key={session.sessionId} session={session} />) : (
          <div className="py-12 text-center text-[12px] text-text-muted">No sessions</div>
        )}
      </div>
    </section>
  );
}

function compareSessionByProjectName(a: SessionInfo, b: SessionInfo) {
  const nameA = a.projectName || a.cwd;
  const nameB = b.projectName || b.cwd;
  const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
  if (byName !== 0) return byName;
  return a.sessionId.localeCompare(b.sessionId);
}

function StatusRing({ status, className }: { status: SessionStatus; className: string }) {
  const inner: ReactNode = status === 'working' ? (
    <circle cx="10" cy="10" r="3" fill="currentColor" />
  ) : status === 'needsinput' ? (
    <path d="M10 6.4c1.75 0 3 1.04 3 2.5 0 1.15-.7 1.83-1.64 2.37-.68.4-.93.72-.93 1.43v.28H9.2v-.35c0-1.1.5-1.67 1.33-2.16.74-.44 1.14-.8 1.14-1.52 0-.84-.66-1.4-1.68-1.4-.97 0-1.62.48-1.8 1.32l-1.18-.18c.23-1.36 1.4-2.29 2.99-2.29zM9.1 14.25h1.45v1.35H9.1z" fill="currentColor" />
  ) : (
    <path d="M8.7 12.4 6.5 10.2l-1 1 3.2 3.2 5.8-6.5-1.05-.95z" fill="currentColor" />
  );

  return (
    <svg className={`w-[21px] h-[21px] ${className}`} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <circle cx="10" cy="10" r="5.5" stroke="currentColor" strokeWidth="1.3" opacity="0.3" />
      {inner}
    </svg>
  );
}
