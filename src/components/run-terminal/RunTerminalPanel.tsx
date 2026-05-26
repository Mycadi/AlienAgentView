import { useCallback, useRef, useEffect } from 'react';
import { useRunTerminalStore, initPtyListeners } from '../../stores/runTerminalStore';
import TerminalInstance from './TerminalInstance';

export default function RunTerminalPanel() {
  const { tabs, activeTabId, panelOpen, panelHeight, setActiveTab, closeTab, togglePanel, setPanelHeight } = useRunTerminalStore();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    initPtyListeners();
  }, []);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: panelHeight };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        setPanelHeight(dragRef.current.startH + delta);
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelHeight, setPanelHeight],
  );

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex flex-col border-t border-[#202532]/60 bg-[#0c0e14] shrink-0"
      style={{ height: panelOpen ? panelHeight : 32 }}
    >
      {/* Drag handle */}
      {panelOpen && (
        <div
          className="h-[3px] cursor-row-resize hover:bg-[#c9893a]/40 transition-colors shrink-0"
          onMouseDown={onDragStart}
        />
      )}

      {/* Tab bar */}
      <div className="h-[29px] shrink-0 flex items-center bg-[#10131b] border-b border-[#202532]/40 px-2 gap-1">
        <button
          onClick={togglePanel}
          className="text-[11px] text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded transition-colors"
          title={panelOpen ? 'Collapse' : 'Expand'}
        >
          {panelOpen ? '\u25BE' : '\u25B4'} Terminal
          <span className="ml-1 text-[10px] opacity-60">{tabs.length}</span>
        </button>

        <div className="w-px h-3 bg-[#202532]/60 mx-1" />

        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors shrink-0 ${
                activeTabId === tab.id
                  ? 'bg-[#1a1e2a] text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-[#1a1e2a]/50'
              }`}
              onClick={() => {
                setActiveTab(tab.id);
                if (!panelOpen) togglePanel();
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  tab.alive ? 'bg-status-working' : 'bg-[#5c6370]'
                }`}
              />
              <span className="truncate max-w-[120px]">{tab.label}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary ml-0.5 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal area */}
      {panelOpen && (
        <div className="flex-1 min-h-0 relative">
          {tabs.map((tab) => (
            <TerminalInstance key={tab.id} ptyId={tab.id} visible={tab.id === activeTabId} />
          ))}
        </div>
      )}
    </div>
  );
}
