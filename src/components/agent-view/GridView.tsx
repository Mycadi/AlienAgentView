import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import type { SessionStatus } from '../../types';
import SessionCard from './SessionCard';

export default function GridView() {
  const { sessions } = useClaudeSessions();

  const sorted = [...sessions].sort((a, b) => {
    const order: Record<SessionStatus, number> = { working: 0, needsinput: 1, error: 2, done: 3 };
    const statusOrder = order[a.status] - order[b.status];
    if (statusOrder !== 0) return statusOrder;
    return (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt);
  });

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {sorted.length === 0 ? (
          <div className="col-span-full text-center py-16 text-text-muted">
            No active sessions found. Start a Alien Code session to see it here.
          </div>
        ) : (
          sorted.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))
        )}
      </div>
    </div>
  );
}
