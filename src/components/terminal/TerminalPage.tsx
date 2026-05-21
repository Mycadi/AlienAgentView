import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettingsStore } from '../../stores/settingsStore';
import { useClaudeSessions } from '../../hooks/useClaudeSessions';

interface CapturedWindow {
  hwnd: number;
  pid: number;
  title: string;
  thumbnail_id: number;
  project_name?: string | null;
  session_id?: string | null;
}

type LayoutMode =
  | 'split-2'
  | 'right-stack'
  | 'left-stack'
  | 'left-wide'
  | 'right-wide'
  | 'grid-4'
  | 'grid-6'
  | 'columns-3'
  | 'center-wide';

type PreviewCell = { x: number; y: number; w: number; h: number };

const layoutOptions: { id: LayoutMode; labelZh: string; labelEn: string; preview: PreviewCell[] }[] = [
  { id: 'split-2', labelZh: '左右双栏', labelEn: 'Two Columns', preview: [{ x: 8, y: 10, w: 38, h: 72 }, { x: 54, y: 10, w: 38, h: 72 }] },
  { id: 'right-stack', labelZh: '右侧堆叠', labelEn: 'Right Stack', preview: [{ x: 8, y: 10, w: 38, h: 72 }, { x: 54, y: 10, w: 38, h: 32 }, { x: 54, y: 50, w: 38, h: 32 }] },
  { id: 'left-stack', labelZh: '左侧堆叠', labelEn: 'Left Stack', preview: [{ x: 8, y: 10, w: 38, h: 32 }, { x: 8, y: 50, w: 38, h: 32 }, { x: 54, y: 10, w: 38, h: 72 }] },
  { id: 'left-wide', labelZh: '左宽右窄', labelEn: 'Left Wide', preview: [{ x: 8, y: 10, w: 58, h: 72 }, { x: 74, y: 10, w: 18, h: 72 }] },
  { id: 'right-wide', labelZh: '左窄右宽', labelEn: 'Right Wide', preview: [{ x: 8, y: 10, w: 18, h: 72 }, { x: 34, y: 10, w: 58, h: 72 }] },
  { id: 'grid-4', labelZh: '四宫格', labelEn: '2x2 Grid', preview: [{ x: 30, y: 16, w: 18, h: 22 }, { x: 52, y: 16, w: 18, h: 22 }, { x: 30, y: 42, w: 18, h: 22 }, { x: 52, y: 42, w: 18, h: 22 }] },
  { id: 'grid-6', labelZh: '六宫格', labelEn: '3x2 Grid', preview: [{ x: 8, y: 14, w: 24, h: 28 }, { x: 38, y: 14, w: 24, h: 28 }, { x: 68, y: 14, w: 24, h: 28 }, { x: 8, y: 50, w: 24, h: 28 }, { x: 38, y: 50, w: 24, h: 28 }, { x: 68, y: 50, w: 24, h: 28 }] },
  { id: 'columns-3', labelZh: '三竖栏', labelEn: 'Three Columns', preview: [{ x: 8, y: 10, w: 24, h: 72 }, { x: 38, y: 10, w: 24, h: 72 }, { x: 68, y: 10, w: 24, h: 72 }] },
  { id: 'center-wide', labelZh: '中间宽栏', labelEn: 'Center Wide', preview: [{ x: 8, y: 10, w: 18, h: 72 }, { x: 34, y: 10, w: 40, h: 72 }, { x: 82, y: 10, w: 10, h: 72 }] },
];

const validLayoutModes = layoutOptions.map((option) => option.id);

export default function TerminalPage() {
  const { language } = useSettingsStore();
  const isZh = language === 'zh-CN';
  const { workingSessions, needsInputSessions } = useClaudeSessions();
  const [captured, setCaptured] = useState<CapturedWindow[]>([]);
  const hasActiveSessions = workingSessions.length + needsInputSessions.length > 0;
  const [layout, setLayout] = useState<LayoutMode>(() => {
    const saved = localStorage.getItem('terminal-layout');
    if (saved === 'grid') {
      return 'grid-4';
    }
    if (saved && validLayoutModes.includes(saved as LayoutMode)) {
      return saved as LayoutMode;
    }
    return 'grid-6';
  });

  const handleLayoutChange = (mode: LayoutMode) => {
    setLayout(mode);
    localStorage.setItem('terminal-layout', mode);
  };
  const [loading, setLoading] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number>(0);

  const handleCapture = useCallback(async () => {
    if (!hasActiveSessions) {
      setCaptured([]);
      return;
    }
    setLoading(true);
    try {
      // Pass empty array to capture ALL AAV windows (backend finds them by title)
      const windows = await invoke<CapturedWindow[]>('capture_windows_by_session_ids', { sessionIds: [] });
      setCaptured(windows);
    } catch (e) {
      console.error('Capture failed:', e);
    } finally {
      setLoading(false);
    }
  }, [hasActiveSessions]);

  // Capture terminal windows on mount
  useEffect(() => {
    handleCapture();
  }, [handleCapture]);

  // Reposition DWM thumbnails whenever captured list, layout, or container size changes
  const repositionWindows = useCallback(async () => {
    const el = containerRef.current;
    if (!el || captured.length === 0) return;

    const tauriWindow = getCurrentWindow();
    const scaleFactor = await tauriWindow.scaleFactor();

    const rect = el.getBoundingClientRect();
    // DWM thumbnail coordinates are relative to the destination window's client area
    const totalW = Math.round(rect.width * scaleFactor);
    const totalH = Math.round(rect.height * scaleFactor);

    const cells = computeCells(layout, captured.length, totalW, totalH).map(fitTerminalAspect);

    for (let i = 0; i < captured.length; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const x = Math.round(rect.left * scaleFactor) + cell.x;
      const y = Math.round(rect.top * scaleFactor) + cell.y;
      const frameInset = Math.round(4 * scaleFactor);
      const thumbnailTopOffset = Math.round(26 * scaleFactor);
      await invoke('resize_captured_window', {
        thumbnailId: captured[i].thumbnail_id,
        x: x + frameInset,
        y: y + thumbnailTopOffset,
        w: Math.max(1, cell.w - frameInset * 2),
        h: Math.max(1, cell.h - thumbnailTopOffset - frameInset),
      }).catch(() => {});
    }
  }, [captured, layout]);

  useEffect(() => {
    repositionWindows();
  }, [repositionWindows]);

  // Track container size and re-layout on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
      clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        repositionWindows();
      }, 150);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(debounceRef.current);
    };
  }, [captured.length, repositionWindows]);

  // Cleanup: release all on unmount (page switch)
  useEffect(() => {
    return () => {
      // When leaving terminal page, release all windows
      invoke('release_all_windows').catch(() => {});
    };
  }, []);

  return (
    <div className="h-full flex flex-col px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">
            {isZh ? '终端' : 'Terminal'}
          </h2>
          <p className="text-sm text-text-muted">
            {captured.length > 0
              ? (isZh ? `已汇聚 ${captured.length} 个终端窗口` : `${captured.length} terminal window(s) captured`)
              : (isZh ? '正在汇聚终端窗口' : 'Capturing terminal windows')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCapture}
            disabled={loading}
            className="h-7 rounded-lg border border-border bg-bg-card px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (isZh ? '刷新中...' : 'Refreshing...') : (isZh ? '刷新' : 'Refresh')}
          </button>
          {/* Layout selector */}
          <div className="flex items-center overflow-hidden rounded-lg border border-border bg-bg-card">
            {layoutOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleLayoutChange(opt.id)}
                title={isZh ? opt.labelZh : opt.labelEn}
                className={`relative h-7 w-9 shrink-0 border-r border-border last:border-r-0 transition-colors ${
                  layout === opt.id
                    ? 'bg-accent-orange/20 text-accent-orange'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
                }`}
              >
                <LayoutPreview cells={opt.preview} active={layout === opt.id} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal container */}
      {captured.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-bg-card border border-border flex items-center justify-center">
              <IconTerminalLarge />
            </div>
            <p className="text-text-muted text-sm mb-4">
              {loading
                ? (isZh ? '正在汇聚终端窗口...' : 'Capturing terminal windows...')
                : hasActiveSessions
                  ? (isZh ? '未找到活跃 Agent 的终端窗口' : 'No terminal windows found for active agents')
                  : (isZh ? '当前无活跃 Agent' : 'No active agents')}
            </p>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
          {/* Placeholders use the exact same cell math as DWM thumbnails, so no extra CSS grid cells appear. */}
          {computeCells(layout, captured.length, containerSize.width, containerSize.height).map(fitTerminalAspect).map((cell, index) => {
            const w = captured[index];
            return (
              <div
                key={w.hwnd}
                onClick={() => invoke('focus_window_by_hwnd', { hwnd: w.hwnd }).catch(() => {})}
                className="absolute rounded border border-[#2a303d] bg-black/20 overflow-hidden cursor-pointer hover:border-accent-orange/50 transition-colors shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                style={{ left: cell.x, top: cell.y, width: cell.w, height: cell.h }}
                title={isZh ? '点击聚焦原窗口' : 'Click to focus original window'}
              >
                <div className="absolute left-0 right-0 top-0 z-10 h-6 flex items-center gap-2 border-b border-[#303744] bg-[#151922]/95 px-3 shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
                  <span className="shrink-0 text-[12px] font-medium text-text-primary">{w.project_name || `PID ${w.pid}`}</span>
                  {w.session_id && <span className="truncate text-[12px] text-text-secondary">{w.session_id.slice(0, 8)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function computeCells(
  layout: LayoutMode,
  count: number,
  totalW: number,
  totalH: number
): { x: number; y: number; w: number; h: number }[] {
  if (count === 0) return [];
  const gap = 4; // physical px gap

  const grid = (cols: number) => {
    const rows = Math.ceil(count / cols);
    const cellW = Math.floor((totalW - gap * (cols - 1)) / cols);
    const cellH = Math.floor((totalH - gap * (rows - 1)) / rows);
    return Array.from({ length: count }, (_, i) => ({
      x: (i % cols) * (cellW + gap),
      y: Math.floor(i / cols) * (cellH + gap),
      w: cellW,
      h: cellH,
    }));
  };

  const columns = (weights: number[]) => {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const cellWidths = weights.map((weight) => Math.floor((totalW - gap * (weights.length - 1)) * weight / totalWeight));
    cellWidths[cellWidths.length - 1] += totalW - gap * (weights.length - 1) - cellWidths.reduce((sum, w) => sum + w, 0);
    const perColumn = Math.ceil(count / weights.length);
    const cells: { x: number; y: number; w: number; h: number }[] = [];
    let x = 0;

    cellWidths.forEach((w) => {
      const items = Math.min(perColumn, count - cells.length);
      const cellH = Math.floor((totalH - gap * Math.max(items - 1, 0)) / Math.max(items, 1));
      for (let row = 0; row < items; row++) {
        cells.push({ x, y: row * (cellH + gap), w, h: cellH });
      }
      x += w + gap;
    });

    return cells;
  };

  const stacked = (stackSide: 'left' | 'right') => {
    const mainW = Math.floor((totalW - gap) / 2);
    const stackW = totalW - mainW - gap;
    const stackCount = Math.max(count - 1, 1);
    const stackH = Math.floor((totalH - gap * Math.max(stackCount - 1, 0)) / stackCount);
    const mainX = stackSide === 'left' ? stackW + gap : 0;
    const stackX = stackSide === 'left' ? 0 : mainW + gap;
    const cells = [{ x: mainX, y: 0, w: mainW, h: totalH }];

    for (let i = 0; i < count - 1; i++) {
      cells.push({ x: stackX, y: i * (stackH + gap), w: stackW, h: stackH });
    }

    return cells;
  };

  switch (layout) {
    case 'split-2':
      return columns([1, 1]);
    case 'right-stack':
      return stacked('right');
    case 'left-stack':
      return stacked('left');
    case 'left-wide':
      return columns([2, 1]);
    case 'right-wide':
      return columns([1, 2]);
    case 'grid-4':
      return grid(2);
    case 'grid-6':
      return grid(3);
    case 'columns-3':
      return columns([1, 1, 1]);
    case 'center-wide':
      return columns([1, 2, 1]);
  }
}


function fitTerminalAspect(cell: { x: number; y: number; w: number; h: number }) {
  const aspect = 16 / 9;
  let w = cell.w;
  let h = Math.floor(w / aspect);
  if (h > cell.h) {
    h = cell.h;
    w = Math.floor(h * aspect);
  }
  return {
    x: cell.x + Math.floor((cell.w - w) / 2),
    y: cell.y + Math.floor((cell.h - h) / 2),
    w,
    h,
  };
}

function LayoutPreview({ cells, active }: { cells: PreviewCell[]; active: boolean }) {
  return (
    <span className="absolute inset-1 block">
      {cells.map((cell, index) => (
        <span
          key={index}
          className={`absolute rounded-[1px] border ${
            active
              ? 'border-accent-orange'
              : 'border-text-muted'
          }`}
          style={{
            left: `${cell.x}%`,
            top: `${cell.y}%`,
            width: `${cell.w}%`,
            height: `${cell.h}%`,
          }}
        />
      ))}
    </span>
  );
}

function IconTerminalLarge() {
  return (
    <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8l4 4-4 4" />
      <path d="M13 16h4" />
    </svg>
  );
}
