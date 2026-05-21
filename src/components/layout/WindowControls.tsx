import { getCurrentWindow } from '@tauri-apps/api/window';

export default function WindowControls() {
  const appWindow = getCurrentWindow();

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  return (
    <div className="absolute top-0 right-0 z-50 h-[28px] flex items-stretch overflow-hidden rounded-bl-[5px] border-l border-b border-[#202532] bg-[#12151d]">
      <button
        type="button"
        className="w-[36px] h-[28px] flex items-center justify-center text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
        onClick={handleMinimize}
        title="Minimize"
      >
        <svg className="w-[10px] h-[10px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2.5 6h7" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="w-[36px] h-[28px] flex items-center justify-center text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors border-l border-[#202532]"
        onClick={handleMaximize}
        title="Maximize"
      >
        <svg className="w-[10px] h-[10px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3.2" y="3.2" width="5.6" height="5.6" rx="0.6" />
        </svg>
      </button>
      <button
        type="button"
        className="w-[36px] h-[28px] flex items-center justify-center text-text-secondary hover:bg-[#c0392b] hover:text-white transition-colors border-l border-[#202532]"
        onClick={handleClose}
        title="Close"
      >
        <svg className="w-[10px] h-[10px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M3 3 9 9M9 3 3 9" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
