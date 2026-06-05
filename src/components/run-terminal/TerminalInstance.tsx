import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { ptyOutputRouter } from '../../stores/runTerminalStore';
import '@xterm/xterm/css/xterm.css';

interface Props {
  ptyId: string;
  visible: boolean;
}

export default function TerminalInstance({ ptyId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // 关闭右键菜单
  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // 全局点击关闭菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const handleCopy = useCallback(() => {
    const sel = termRef.current?.getSelection();
    if (sel) navigator.clipboard.writeText(sel);
    closeMenu();
  }, [closeMenu]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        invoke('pty_write', {
          id: ptyId,
          data: Array.from(new TextEncoder().encode(text)),
        }).catch(() => {});
      }
    } catch { /* clipboard access denied */ }
    closeMenu();
  }, [ptyId, closeMenu]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      theme: {
        background: '#0c0e14',
        foreground: '#c8ccd4',
        cursor: '#c9893a',
        selectionBackground: '#c9893a40',
        black: '#1e222a',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    invoke('pty_resize', { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});

    // Register writer — replays buffered data, then receives live output
    ptyOutputRouter.register(ptyId, (data) => term.write(data));

    const disposeData = term.onData((data) => {
      invoke('pty_write', { id: ptyId, data: Array.from(new TextEncoder().encode(data)) }).catch(() => {});
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0) {
        fit.fit();
        invoke('pty_resize', { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      disposeData.dispose();
      ptyOutputRouter.remove(ptyId);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [ptyId]);

  // Re-fit when becoming visible
  useEffect(() => {
    if (visible && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
      });
    }
  }, [visible]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      onContextMenu={onContextMenu}
    >
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[120px] rounded border border-[#3e4452] bg-[#1e222a] py-1 text-sm text-[#abb2bf] shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-[#2c313a] disabled:opacity-40"
            onClick={handleCopy}
            disabled={!termRef.current?.getSelection()}
          >
            复制
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-[#2c313a]"
            onClick={handlePaste}
          >
            粘贴
          </button>
        </div>
      )}
    </div>
  );
}
