import { useMemo, useState } from 'react';
import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';
import type { DailyActivity } from '../../types';

export default function StatsPage() {
  const { stats } = useClaudeSessions();
  const { language } = useSettingsStore();
  const isZh = language === 'zh-CN';

  const { weekStats, monthStats } = useMemo(() => {
    if (!stats) return { weekStats: null, monthStats: null };
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const monthAgo = new Date(today);
    monthAgo.setDate(today.getDate() - 29);

    const weekKey = fmt(weekAgo);
    const monthKey = fmt(monthAgo);

    let wMsg = 0, wSes = 0, wTok = 0;
    let mMsg = 0, mSes = 0, mTok = 0;
    for (const d of stats.dailyActivity) {
      if (d.date >= weekKey) {
        wMsg += d.messageCount; wSes += d.sessionCount; wTok += d.tokens;
      }
      if (d.date >= monthKey) {
        mMsg += d.messageCount; mSes += d.sessionCount; mTok += d.tokens;
      }
    }
    return {
      weekStats: { messages: wMsg, sessions: wSes, tokens: wTok },
      monthStats: { messages: mMsg, sessions: mSes, tokens: mTok },
    };
  }, [stats]);

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        {isZh ? '暂无统计数据' : 'No stats available'}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Lifetime stats */}
      <Section title={isZh ? '累计统计' : 'Lifetime Stats'} subtitle={stats.lastComputedDate ? (isZh ? `数据截至 ${stats.lastComputedDate}` : `As of ${stats.lastComputedDate}`) : undefined}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
          <StatCard label={isZh ? '总会话' : 'Total Sessions'} value={stats.totalSessions} />
          <StatCard label={isZh ? '总消息' : 'Total Messages'} value={stats.totalMessages} />
          <StatCard label={isZh ? '输入 Tokens' : 'Input Tokens'} value={formatNum(stats.totalInputTokens)} />
          <StatCard label={isZh ? '输出 Tokens' : 'Output Tokens'} value={formatNum(stats.totalOutputTokens)} />
          <StatCard label={isZh ? '缓存读取' : 'Cache Read'} value={formatNum(stats.totalCacheReadTokens)} />
          <StatCard label={isZh ? '缓存创建' : 'Cache Create'} value={formatNum(stats.totalCacheCreationTokens)} />
        </div>
      </Section>

      {/* Week + Month stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {weekStats && (
          <Section title={isZh ? '近 7 天' : 'Last 7 Days'}>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <StatCard label={isZh ? '消息' : 'Messages'} value={weekStats.messages} />
              <StatCard label={isZh ? '会话' : 'Sessions'} value={weekStats.sessions} />
              <StatCard label="Tokens" value={formatNum(weekStats.tokens)} />
            </div>
          </Section>
        )}
        {monthStats && (
          <Section title={isZh ? '近 30 天' : 'Last 30 Days'}>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <StatCard label={isZh ? '消息' : 'Messages'} value={monthStats.messages} />
              <StatCard label={isZh ? '会话' : 'Sessions'} value={monthStats.sessions} />
              <StatCard label="Tokens" value={formatNum(monthStats.tokens)} />
            </div>
          </Section>
        )}
      </div>

      {/* Contribution heatmap */}
      <Section title={isZh ? '活动热力图' : 'Activity Heatmap'}>
        <ContributionGraph dailyActivity={stats.dailyActivity} isZh={isZh} />
      </Section>
    </div>
  );
}

// ── Contribution heatmap (GitHub-style) ──

const CELL = 13;
const GAP = 3;
const ROWS = 7;

const COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const DAY_EN = ['Mon','','Wed','','Fri','',''];
const DAY_ZH = ['一','','三','','五','',''];

function ContributionGraph({ dailyActivity, isZh }: { dailyActivity: DailyActivity[]; isZh: boolean }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const { grid, totalContribs, monthLabels, maxVal, years } = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const d of dailyActivity) {
      lookup.set(d.date, d.messageCount);
    }

    const today = new Date();
    const endDay = selectedYear === null ? new Date(today) : new Date(selectedYear, 11, 31);
    if (selectedYear === null) {
      endDay.setHours(0, 0, 0, 0);
    }

    const startDay = selectedYear === null ? new Date(endDay) : new Date(selectedYear, 0, 1);
    if (selectedYear === null) {
      startDay.setDate(endDay.getDate() - 364);
    }
    const startDow = startDay.getDay();
    const offset = startDow === 0 ? 6 : startDow - 1;
    startDay.setDate(startDay.getDate() - offset);

    const cells: { date: string; count: number; col: number; row: number }[] = [];
    const cur = new Date(startDay);
    let col = 0;
    let maxVal = 0;
    let totalContribs = 0;

    while (cur <= endDay) {
      const row = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
      const key = fmt(cur);
      const count = lookup.get(key) ?? 0;
      if (count > maxVal) maxVal = count;
      totalContribs += count;
      cells.push({ date: key, count, col, row });
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() === 1 || (cur.getDay() === 0 && cur <= endDay)) {
        // new week starts on Monday
      }
      if (row === 6) col++;
    }

    const monthLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (const c of cells) {
      if (c.row !== 0) continue;
      const m = parseInt(c.date.slice(5, 7), 10) - 1;
      if (m !== lastMonth) {
        monthLabels.push({ label: isZh ? MONTH_ZH[m] : MONTH_EN[m], col: c.col });
        lastMonth = m;
      }
    }

    const years = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2];

    return { grid: cells, totalContribs, monthLabels, maxVal, years };
  }, [dailyActivity, isZh, selectedYear]);

  const totalCols = (grid.length > 0 ? grid[grid.length - 1].col : 0) + 1;
  const leftPad = 32;
  const svgW = leftPad + totalCols * (CELL + GAP) + GAP;
  const svgH = 20 + ROWS * (CELL + GAP) + GAP + 28;

  const dayLabels = isZh ? DAY_ZH : DAY_EN;

  return (
    <div>
      <div className="text-sm text-text-primary mb-3 font-medium">
        {isZh
          ? `过去一年共 ${totalContribs.toLocaleString()} 条消息`
          : `${totalContribs.toLocaleString()} messages in the last year`}
      </div>
      <div className="flex items-start gap-4">
        <div className="overflow-x-auto flex-1">
          <svg width={svgW} height={svgH} className="block">
            {/* Month labels */}
            {monthLabels.map((m, i) => (
              <text key={i} x={leftPad + m.col * (CELL + GAP)} y={12} className="fill-text-muted" fontSize="10" fontFamily="inherit">
                {m.label}
              </text>
            ))}
            {/* Day labels */}
            {dayLabels.map((d, i) => (
              d ? <text key={i} x={0} y={20 + i * (CELL + GAP) + CELL - 2} className="fill-text-muted" fontSize="10" fontFamily="inherit">{d}</text> : null
            ))}
            {/* Cells */}
            {grid.map((c, i) => (
              <rect
                key={i}
                x={leftPad + c.col * (CELL + GAP)}
                y={20 + c.row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={colorForCount(c.count, maxVal)}
              >
                <title>{`${c.date}: ${c.count}`}</title>
              </rect>
            ))}
            {/* Legend */}
            <text x={svgW - 160} y={svgH - 6} className="fill-text-muted" fontSize="10" fontFamily="inherit">Less</text>
            {COLORS.map((color, i) => (
              <rect key={i} x={svgW - 130 + i * (CELL + GAP)} y={svgH - 18} width={CELL} height={CELL} rx={2} fill={color} />
            ))}
            <text x={svgW - 130 + COLORS.length * (CELL + GAP) + 4} y={svgH - 6} className="fill-text-muted" fontSize="10" fontFamily="inherit">More</text>
          </svg>
        </div>
        <div className="flex flex-col gap-1 pt-2 shrink-0">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setSelectedYear(selectedYear === y ? null : y)}
              className={`px-3 py-1 rounded text-xs leading-6 text-left transition-colors ${selectedYear === y ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function colorForCount(count: number, max: number): string {
  if (count === 0 || max === 0) return COLORS[0];
  const ratio = count / max;
  if (ratio <= 0.25) return COLORS[1];
  if (ratio <= 0.5) return COLORS[2];
  if (ratio <= 0.75) return COLORS[3];
  return COLORS[4];
}

// ── Shared helpers ──

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="p-5 bg-bg-card border border-border rounded-xl">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
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

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
