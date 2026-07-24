import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chatStore';
import type { ChatRole, Language } from '../../types';

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
    mutedSessions,
    removeMutedSession,
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

        {/* Muted sessions */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {isZh ? '已屏蔽会话' : 'Muted Sessions'}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {isZh ? '这些会话进入"需要输入"时不触发托盘闪烁和通知。' : 'These sessions won\'t trigger tray flash or notification when they need input.'}
          </p>
          {mutedSessions.length === 0 ? (
            <div className="text-xs text-text-muted">
              {isZh ? '暂无屏蔽会话' : 'No muted sessions'}
            </div>
          ) : (
            <div className="space-y-2">
              {mutedSessions.map((sid) => (
                <div key={sid} className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-primary border border-border rounded-lg">
                  <span className="text-sm text-text-primary font-mono truncate">{sid}</span>
                  <button
                    onClick={() => removeMutedSession(sid)}
                    className="shrink-0 text-xs text-text-muted hover:text-red-400 transition-colors"
                  >
                    {isZh ? '取消屏蔽' : 'Unmute'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat model & roles */}
        <ChatSettingsSection isZh={isZh} />

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

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ChatSettingsSection({ isZh }: { isZh: boolean }) {
  const { config, loadConfig, updateModel, saveRoles } = useChatStore();

  const [baseUrl, setBaseUrl] = useState(config.model.baseUrl);
  const [apiKey, setApiKey] = useState(config.model.apiKey);
  const [model, setModel] = useState(config.model.model);
  const [roles, setRoles] = useState<ChatRole[]>(config.roles);
  const [defaultRoleId, setDefaultRoleId] = useState(config.defaultRoleId);
  const [modelSaved, setModelSaved] = useState(false);
  const [rolesSaved, setRolesSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setBaseUrl(config.model.baseUrl);
    setApiKey(config.model.apiKey);
    setModel(config.model.model);
    setRoles(config.roles);
    setDefaultRoleId(config.defaultRoleId);
  }, [config]);

  const saveModel = async () => {
    await updateModel({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setModelSaved(true);
    setTimeout(() => setModelSaved(false), 1500);
  };

  const addRole = () => {
    const id = uid();
    setRoles((prev) => [...prev, { id, name: isZh ? '新角色' : 'New Role', systemPrompt: '' }]);
    setEditingId(id);
  };

  const updateRole = (id: string, patch: Partial<ChatRole>) => {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRole = (id: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== id));
    if (defaultRoleId === id) setDefaultRoleId('');
  };

  const saveRoleList = async () => {
    await saveRoles(roles, defaultRoleId);
    setRolesSaved(true);
    setTimeout(() => setRolesSaved(false), 1500);
  };

  const inputCls =
    'w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-border-glow transition-colors';

  return (
    <>
      {/* Chat model */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {isZh ? '对话模型' : 'Chat Model'}
        </h3>
        <p className="text-xs text-text-muted mb-3">
          {isZh ? 'OpenAI 兼容接口。请求由本地后端代理发出。' : 'OpenAI-compatible API. Requests are proxied by the local backend.'}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Base URL</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">{isZh ? '模型名称' : 'Model'}</label>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" className={inputCls} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={saveModel}
            className="px-3 py-1.5 bg-accent-orange text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-orange/90 transition-colors"
          >
            {isZh ? '保存' : 'Save'}
          </button>
          {modelSaved && <span className="text-xs text-green-400">{isZh ? '已保存' : 'Saved'}</span>}
        </div>
      </div>

      {/* Chat roles */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {isZh ? '对话角色' : 'Chat Roles'}
        </h3>
        <p className="text-xs text-text-muted mb-3">
          {isZh ? '每个角色是一段系统提示词。设为默认后，打开对话默认使用该角色。' : 'Each role is a system prompt. The default role is used when opening Chat.'}
        </p>
        <div className="space-y-3">
          {roles.length === 0 ? (
            <div className="text-xs text-text-muted">{isZh ? '暂无角色' : 'No roles'}</div>
          ) : (
            roles.map((r) => (
              <div key={r.id} className="border border-border rounded-lg p-3 bg-bg-primary/50 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => updateRole(r.id, { name: e.target.value })}
                    placeholder={isZh ? '角色名称' : 'Role name'}
                    className="flex-1 px-2 py-1.5 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-border-glow"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="radio"
                      name="defaultRole"
                      checked={defaultRoleId === r.id}
                      onChange={() => setDefaultRoleId(r.id)}
                      className="accent-accent-orange"
                    />
                    {isZh ? '默认' : 'Default'}
                  </label>
                  <button
                    onClick={() => setEditingId((id) => (id === r.id ? null : r.id))}
                    className="shrink-0 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    {editingId === r.id ? (isZh ? '收起' : 'Collapse') : (isZh ? '编辑' : 'Edit')}
                  </button>
                  <button
                    onClick={() => removeRole(r.id)}
                    className="shrink-0 text-xs text-text-muted hover:text-red-400 transition-colors"
                  >
                    {isZh ? '删除' : 'Delete'}
                  </button>
                </div>
                {editingId === r.id && (
                  <textarea
                    value={r.systemPrompt}
                    onChange={(e) => updateRole(r.id, { systemPrompt: e.target.value })}
                    rows={3}
                    placeholder={isZh ? '系统提示词' : 'System prompt'}
                    className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-border-glow resize-y"
                  />
                )}
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={addRole}
            className="px-3 py-1.5 border border-border text-text-secondary rounded-lg text-sm hover:text-text-primary hover:border-border-glow transition-colors"
          >
            {isZh ? '+ 添加角色' : '+ Add Role'}
          </button>
          <button
            onClick={saveRoleList}
            className="px-3 py-1.5 bg-accent-orange text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-orange/90 transition-colors"
          >
            {isZh ? '保存角色' : 'Save Roles'}
          </button>
          {rolesSaved && <span className="text-xs text-green-400">{isZh ? '已保存' : 'Saved'}</span>}
        </div>
      </div>
    </>
  );
}
