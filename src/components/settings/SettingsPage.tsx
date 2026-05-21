import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Language } from '../../types';

const languages: { id: Language; label: string }[] = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en', label: 'English' },
];

export default function SettingsPage() {
  const {
    language,
    setLanguage,
    refreshInterval,
    setRefreshInterval,
    claudeDir,
    setClaudeDir,
    terminalCommand,
    setTerminalCommand,
    inputFilterWords,
    loadAppSettings,
    setInputFilterWords,
  } = useSettingsStore();
  const isZh = language === 'zh-CN';
  const [localTerminalCommand, setLocalTerminalCommand] = useState(terminalCommand);
  const [localClaudeDir, setLocalClaudeDir] = useState(claudeDir);
  const [localRefreshInterval, setLocalRefreshInterval] = useState(refreshInterval);
  const [filterWordsText, setFilterWordsText] = useState(inputFilterWords.join(';'));
  const [isFilterWordsDirty, setIsFilterWordsDirty] = useState(false);
  const [isSavingFilterWords, setIsSavingFilterWords] = useState(false);
  const [filterWordsError, setFilterWordsError] = useState('');

  useEffect(() => {
    loadAppSettings();
  }, [loadAppSettings]);

  useEffect(() => {
    setLocalTerminalCommand(terminalCommand);
  }, [terminalCommand]);

  useEffect(() => {
    setLocalClaudeDir(claudeDir);
  }, [claudeDir]);

  useEffect(() => {
    setLocalRefreshInterval(refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    if (!isFilterWordsDirty) {
      setFilterWordsText(inputFilterWords.join(';'));
    }
  }, [inputFilterWords, isFilterWordsDirty]);

  const saveFilterWords = async () => {
    setIsSavingFilterWords(true);
    setFilterWordsError('');
    try {
      await setInputFilterWords(filterWordsText.split(';'));
      setIsFilterWordsDirty(false);
    } catch (e) {
      setFilterWordsError(String(e));
    } finally {
      setIsSavingFilterWords(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <h2 className="text-xl font-bold text-text-primary mb-1">{isZh ? '设置' : 'Settings'}</h2>
      <p className="text-sm text-text-muted mb-6">
        {isZh ? '配置 AlienAgentView' : 'Configure AlienAgentView'}
      </p>

      <div className="max-w-2xl space-y-6">
        {/* Language */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? '语言' : 'Language'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? '选择界面显示语言' : 'Choose the interface language'}
          </p>
          <div className="inline-flex items-center rounded-lg border border-border bg-bg-primary p-1">
            {languages.map((item) => (
              <button
                key={item.id}
                onClick={() => setLanguage(item.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  language === item.id
                    ? 'bg-[#2a2114] text-accent-orange'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh interval */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? '刷新间隔' : 'Refresh Interval'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? '轮询会话更新的频率（文件监听事件之外）' : 'How often to poll for session updates (in addition to file watcher events)'}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="30"
              value={localRefreshInterval}
              onChange={(e) => setLocalRefreshInterval(Number(e.target.value))}
              onPointerUp={() => setRefreshInterval(localRefreshInterval)}
              className="flex-1 accent-accent-orange"
            />
            <span className="text-sm text-text-primary w-12 text-right">
              {localRefreshInterval}s
            </span>
          </div>
        </div>

        {/* Claude directory */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? 'Claude 数据目录' : 'Claude Data Directory'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? 'Alien Code 会话数据的位置' : 'Location of Alien Code session data'}
          </p>
          <input
            type="text"
            value={localClaudeDir}
            onChange={(e) => setLocalClaudeDir(e.target.value)}
            onBlur={() => setClaudeDir(localClaudeDir)}
            placeholder="~/.claude"
            className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors"
          />
        </div>

        {/* Terminal command */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? '终端启动命令' : 'Terminal Command'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? '在项目目录中启动终端时执行的命令' : 'Command to run when opening a terminal in a project directory'}
          </p>
          <input
            type="text"
            value={localTerminalCommand}
            onChange={(e) => setLocalTerminalCommand(e.target.value)}
            onBlur={() => setTerminalCommand(localTerminalCommand)}
            placeholder="acode"
            className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors"
          />
        </div>

        {/* Input filter words */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? '输入过滤词' : 'Input Filter Words'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? '用 ; 分隔；会话输入详情中完全匹配这些词的输入会被隐藏。' : 'Separate with ;. Exact matches are hidden from session input details.'}
          </p>
          <textarea
            value={filterWordsText}
            onChange={(e) => {
              setFilterWordsText(e.target.value);
              setIsFilterWordsDirty(true);
              setFilterWordsError('');
            }}
            rows={5}
            className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors resize-y"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={saveFilterWords}
              disabled={!isFilterWordsDirty || isSavingFilterWords}
              className="px-3 py-1.5 bg-accent-orange text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSavingFilterWords ? (isZh ? '保存中...' : 'Saving...') : (isZh ? '保存' : 'Save')}
            </button>
            {filterWordsError && (
              <span className="text-xs text-red-400">{filterWordsError}</span>
            )}
          </div>
        </div>

        {/* About */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">{isZh ? '关于' : 'About'}</h3>
          <div className="text-xs text-text-muted space-y-1">
            <p>AlienAgentView v0.1.0</p>
            <p>{isZh ? '在一个地方监控和管理所有 AI 编程会话。' : 'Monitor and manage all your AI coding sessions in one place.'}</p>
            <p>{isZh ? '基于 Tauri 2 + React + TypeScript 构建' : 'Built with Tauri 2 + React + TypeScript'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
