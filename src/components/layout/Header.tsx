import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';

export default function Header() {
  const { sessions, lastUpdated } = useClaudeSessions();
  const { language } = useSettingsStore();
  const isZh = language === 'zh-CN';
  const activeSessions = sessions.filter((s) => s.isAlive).length;
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated, isZh) : isZh ? '从未' : 'never';

  return (
    <header className="h-[91px] px-[26px] pt-[24px] flex items-start justify-between" data-tauri-drag-region>
      <div>
        <h1 className="text-[24px] leading-[28px] font-bold tracking-[-0.025em] text-text-primary">{isZh ? 'Agent 视图' : 'Agent View'}</h1>
        <p className="mt-[5px] text-[13px] leading-[17px] text-text-secondary">
          {isZh ? '在一个地方监控和管理所有 Alien Code 会话。' : 'Monitor and manage all your Alien Code sessions in one place.'}
        </p>
      </div>

      <div className="absolute top-[56px] right-[32px] flex items-center justify-end">
        <div className="flex items-center gap-[8px] text-[13px] text-text-secondary">
          <span className="w-[7px] h-[7px] rounded-full bg-status-done shadow-[0_0_8px_rgba(87,184,106,0.6)]" />
          <span>{isZh ? '最后更新' : 'Last updated'} {timeAgo}</span>
          <span className="text-[#343947]">·</span>
          <span className="font-semibold text-text-primary">{isZh ? `${activeSessions} 个会话活跃` : `${activeSessions} sessions active`}</span>
        </div>
      </div>
    </header>
  );
}

function formatTimeAgo(date: Date, isZh: boolean): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return isZh ? '刚刚' : 'just now';
  if (seconds < 60) return isZh ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return isZh ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return isZh ? `${hours} 小时前` : `${hours}h ago`;
}
