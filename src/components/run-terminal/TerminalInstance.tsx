import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

interface Props {
  ptyId: string;
  visible: boolean;
}

export default function TerminalInstance({ ptyId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
        scrollbarSliderBackground: '#242a3780',
        scrollbarSliderHoverBackground: '#2e354890',
        scrollbarSliderActiveBackground: '#363d50',
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

    // Send initial size
    invoke('pty_resize', { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});

    // Listen for PTY output
    let unlisten: UnlistenFn | null = null;
    listen<{ id: string; data: number[] }>('pty-output', (event) => {
      if (event.payload.id === ptyId) {
        term.write(new Uint8Array(event.payload.data));
      }
    }).then((fn) => {
      unlisten = fn;
    });

    // Forward user input to PTY
    const disposeData = term.onData((data) => {
      invoke('pty_write', { id: ptyId, data: Array.from(new TextEncoder().encode(data)) }).catch(() => {});
    });

    // Handle resize
    const ro = new ResizeObserver(() => {
      fit.fit();
      invoke('pty_resize', { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      disposeData.dispose();
      unlisten?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [ptyId]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (visible && fitRef.current) {
      // Small delay to ensure DOM has updated
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    />
  );
}
