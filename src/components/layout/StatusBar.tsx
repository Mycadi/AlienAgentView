import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';

export default function StatusBar() {
  const { sessions, workingSessions, needsInputSessions, doneSessions, stats } = useClaudeSessions();
  const { language, setPage } = useSettingsStore();
  const isZh = language === 'zh-CN';
  const [todayTokens, setTodayTokens] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const fetchToday = async () => {
      try {
        const res = await invoke<{ totalTokens: number }>('get_today_usage');
        if (mounted) setTodayTokens(res.totalTokens ?? 0);
      } catch {
        if (mounted) setTodayTokens(0);
      }
    };
    fetchToday();
    const timer = setInterval(fetchToday, 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const tokenDisplay = formatTokens(todayTokens);
  const spark = (stats?.dailyActivity ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((d) => d.tokens);
  const sparkMax = spark.reduce((m, v) => (v > m ? v : m), 0);

  return (
    <footer className="h-[62px] bg-[#10131b]/95 px-[26px] flex items-center justify-between">
      <div className="flex items-center gap-[48px]">
        <Stat icon={<WaveIcon />} label={isZh ? '总会话' : 'Total Sessions'} value={sessions.length} />
        <Stat dot="bg-status-working" label={isZh ? '工作中' : 'Working'} value={workingSessions.length} />
        <Stat dot="bg-status-needs-input" label={isZh ? '需要输入' : 'Needs Input'} value={needsInputSessions.length} />
        <Stat dot="bg-status-done" label={isZh ? '已完成' : 'Done'} value={doneSessions.length} />
      </div>

      <div className="flex items-center gap-[16px]">
        <div>
          <div className="text-[11px] leading-[14px] text-text-muted">{isZh ? '总 Token（今日）' : 'Total Tokens (Today)'}</div>
          <div className="text-[20px] leading-[24px] font-bold text-text-primary">{tokenDisplay}</div>
        </div>
        {spark.length > 0 && (
          <button
            type="button"
            onClick={() => setPage('stats')}
            className="h-[34px] flex items-end gap-[4px] cursor-pointer"
          >
            {spark.map((v, i) => {
              const ratio = sparkMax > 0 ? v / sparkMax : 0;
              const height = Math.max(2, Math.round(ratio * 34));
              return (
                <span
                  key={i}
                  className="w-[4px] rounded-[1px] bg-[#c9893a]"
                  style={{ height: `${height}px`, opacity: 0.35 + ratio * 0.65 }}
                />
              );
            })}
          </button>
        )}
      </div>
    </footer>
  );
}

function Stat({ icon, dot, label, value }: { icon?: React.ReactNode; dot?: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-[10px]">
      {icon ?? <span className={`w-[9px] h-[9px] rounded-full ${dot}`} />}
      <div>
        <div className="text-[11px] leading-[14px] text-text-muted">{label}</div>
        <div className="text-[20px] leading-[24px] font-bold text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function WaveIcon() {
  return <svg className="w-[24px] h-[24px] text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 12h3l2-6 4 14 3-9 2 5h6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
