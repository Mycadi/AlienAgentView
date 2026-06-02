import type { ReactNode } from 'react';
import type { Page } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';

const navItems: { id: Page; labels: { zh: string; en: string }; icon: ReactNode }[] = [
  { id: 'agent-view', labels: { zh: 'Agent 视图', en: 'Agent View' }, icon: <IconBoard /> },
  { id: 'projects', labels: { zh: '项目', en: 'Projects' }, icon: <IconFolder /> },
  { id: 'sessions', labels: { zh: '会话', en: 'Sessions' }, icon: <IconClock /> },
  { id: 'terminal', labels: { zh: '终端', en: 'Terminal' }, icon: <IconTerminal /> },
  { id: 'stats', labels: { zh: '统计', en: 'Stats' }, icon: <IconChart /> },
  { id: 'settings', labels: { zh: '设置', en: 'Settings' }, icon: <IconGear /> },
];

export default function Sidebar() {
  const { currentPage, language, setPage } = useSettingsStore();
  const isZh = language === 'zh-CN';

  return (
    <aside className="w-[202px] shrink-0 bg-[#11131b] border-r border-[#202532] flex flex-col">
      <div className="h-[88px] px-[14px] pt-[19px]" data-tauri-drag-region>
        <div className="flex items-start gap-[8px]">
          <img src="/logo.png" className="w-[28px] h-[28px] object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div className="pt-[1px]">
            <div className="whitespace-nowrap text-[17px] leading-[20px] font-semibold tracking-[-0.02em] text-text-primary">Alien Agent View</div>
            <div className="text-[11px] leading-[16px] text-text-muted">v2.1.87</div>
          </div>
        </div>
      </div>

      <nav className="px-[11px] pt-[7px] space-y-[12px] flex-1">
        {navItems.map((item) => {
          const active = item.id === currentPage;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`relative w-full h-[34px] flex items-center gap-[12px] px-[14px] rounded-[4px] text-[13px] font-medium transition-all ${
                active
                  ? 'text-accent-orange bg-white/[0.045]'
                  : 'text-text-secondary hover:bg-white/[0.03] hover:text-text-primary'
              }`}
            >
              {active && <span className="absolute -left-[10px] top-0 bottom-0 w-[3px] rounded-full bg-accent-orange shadow-[0_0_10px_rgba(201,137,58,0.5)]" />}
              <span className="w-[18px] h-[18px] flex items-center justify-center">{item.icon}</span>
              <span>{isZh ? item.labels.zh : item.labels.en}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-[18px] mb-[34px] rounded-[7px] border border-[#2a303d] bg-[#141821] p-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
        <div className="flex items-center gap-[8px] mb-[12px]">
          <ShortcutModifierKey />
          <span className="text-[16px] text-text-secondary">+</span>
          <kbd className="w-[34px] h-[34px] rounded-[5px] border border-[#333a49] bg-[#0d1017] text-[17px] font-semibold flex items-center justify-center text-text-primary shadow-[0_3px_8px_rgba(0,0,0,0.3)]">J</kbd>
        </div>
        <div className="text-[14px] font-semibold text-text-primary leading-[18px]">{isZh ? '打开 Agent 视图' : 'Open Agent View'}</div>
        <div className="text-[12px] text-text-secondary leading-[16px]">{isZh ? '快速打开面板' : 'Quickly open panel'}</div>
      </div>
    </aside>
  );
}

function ShortcutModifierKey() {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  return (
    <kbd className={`${isMac ? 'w-[34px]' : 'w-[48px]'} h-[34px] rounded-[5px] border border-[#333a49] bg-[#0d1017] text-[14px] font-semibold flex items-center justify-center text-text-primary shadow-[0_3px_8px_rgba(0,0,0,0.3)]`}>
      {isMac ? '⌘' : 'CTRL'}
    </kbd>
  );
}

function IconBoard() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>; }
function IconFolder() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 7.5V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1.5"/></svg>; }
function IconClock() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>; }
function IconGear() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.2 7.2 0 0 0-2-1.1L14.2 3h-4.4l-.3 2.8a7.2 7.2 0 0 0-2 1.1l-2.4-1-2 3.4 2 1.5A7.5 7.5 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.2 7.2 0 0 0 2 1.1l.3 2.8h4.4l.3-2.8a7.2 7.2 0 0 0 2-1.1l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>; }
function IconTerminal() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8l4 4-4 4"/><path d="M13 16h4"/></svg>; }
function IconChart() { return <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="13" width="3" height="7" rx="0.5"/><rect x="10.5" y="8" width="3" height="12" rx="0.5"/><rect x="17" y="4" width="3" height="16" rx="0.5"/></svg>; }
