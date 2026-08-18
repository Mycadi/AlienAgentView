import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';

export default function ChatPage() {
  const isZh = useSettingsStore((s) => s.language) === 'zh-CN';
  const {
    config,
    conversations,
    currentId,
    streaming,
    error,
    loadConfig,
    loadConversations,
    newConversation,
    selectConversation,
    deleteConversation,
    setCurrentRole,
    sendMessage,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      await loadConfig();
      await loadConversations();
      // Opening Chat always starts a fresh conversation with the default role.
      newConversation();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = conversations.find((c) => c.id === currentId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [current?.messages, streaming]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  /** Read image files into base64 data URLs and queue them for sending. */
  const addFiles = (files: FileList | File[] | null) => {
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    imgs.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        if (typeof url === 'string') setPending((prev) => [...prev, url]);
      };
      reader.readAsDataURL(f);
    });
  };

  const handleSend = () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || streaming) return;
    setInput('');
    setPending([]);
    sendMessage(text, pending);
  };

  return (
    <>
    <div className="h-full flex">
      {/* History list */}
      <div className="w-[220px] shrink-0 border-r border-border bg-bg-card/40 flex flex-col">
        <div className="p-3">
          <button
            onClick={() => newConversation()}
            className="w-full px-3 py-2 bg-accent-orange text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-orange/90 transition-colors"
          >
            {isZh ? '+ 新对话' : '+ New Chat'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="px-2 py-3 text-xs text-text-muted">
              {isZh ? '暂无对话' : 'No conversations'}
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  c.id === currentId ? 'bg-white/[0.06] text-text-primary' : 'text-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-sm truncate">{c.title || (isZh ? '新对话' : 'New Chat')}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-opacity"
                  title={isZh ? '删除' : 'Delete'}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12" /></svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Role selector */}
        <div className="h-[52px] shrink-0 flex items-center gap-3 px-4 border-b border-border">
          <span className="text-xs text-text-muted">{isZh ? '角色' : 'Role'}</span>
          <select
            value={current?.roleId ?? config.defaultRoleId}
            onChange={(e) => setCurrentRole(e.target.value)}
            disabled={!current}
            className="px-2 py-1 bg-bg-primary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-border-glow disabled:opacity-50"
          >
            <option value="">{isZh ? '（无角色）' : '(No role)'}</option>
            {config.roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {config.roles.length === 0 && (
            <span className="text-xs text-text-muted">
              {isZh ? '可在设置中添加角色' : 'Add roles in Settings'}
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {!current || current.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-text-muted">
              {isZh ? '开始新的对话吧' : 'Start a new conversation'}
            </div>
          ) : (
            current.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                    m.role === 'user'
                      ? 'bg-accent-orange text-bg-primary rounded-br-sm whitespace-pre-wrap'
                      : 'bg-bg-card border border-border text-text-primary rounded-bl-sm'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <div className="chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      streaming ? '…' : ''
                    )
                  ) : (
                    <>
                      {m.images && m.images.length > 0 && (
                        <div className={`flex flex-wrap gap-1.5 ${m.content ? 'mb-1.5' : ''}`}>
                          {m.images.map((src, k) => (
                            <img
                              key={k}
                              src={src}
                              alt={isZh ? '附件图片' : 'Attached image'}
                              onClick={() => setPreview(src)}
                              title={isZh ? '点击查看原图' : 'Click to view full size'}
                              className="max-w-[160px] max-h-[160px] rounded-lg object-cover cursor-zoom-in"
                            />
                          ))}
                        </div>
                      )}
                      {m.content}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-400 border-t border-border">{error}</div>
        )}

        {/* Input */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`shrink-0 p-3 border-t transition-colors ${
            dragOver ? 'border-accent-orange bg-accent-orange/5' : 'border-border'
          }`}
        >
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pending.map((src, i) => (
                <div key={i} className="relative group">
                  <img
                    src={src}
                    alt=""
                    onClick={() => setPreview(src)}
                    title={isZh ? '点击查看原图' : 'Click to view full size'}
                    className="w-16 h-16 rounded-lg object-cover border border-border cursor-zoom-in"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPending((prev) => prev.filter((_, k) => k !== i));
                    }}
                    title={isZh ? '移除' : 'Remove'}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-bg-primary border border-border text-text-muted hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title={isZh ? '添加图片' : 'Add image'}
              className="shrink-0 p-2.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.items)
                  .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => f !== null);
                if (files.length > 0) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={isZh ? '输入消息，可粘贴或拖入图片。Enter 发送，Shift+Enter 换行' : 'Type a message, paste or drop images. Enter to send, Shift+Enter for newline'}
              className="flex-1 resize-none max-h-[160px] px-3 py-2.5 bg-bg-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-border-glow transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={streaming || (!input.trim() && pending.length === 0)}
              className="shrink-0 px-4 py-2.5 bg-accent-orange text-bg-primary rounded-lg text-sm font-medium hover:bg-accent-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {streaming ? (isZh ? '生成中' : 'Sending') : (isZh ? '发送' : 'Send')}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Full-size image preview */}
    {preview && (
      <div
        onClick={() => setPreview(null)}
        className="fixed inset-0 z-50 bg-black/80 overflow-auto cursor-zoom-out"
      >
        <button
          onClick={() => setPreview(null)}
          title={isZh ? '关闭' : 'Close'}
          className="fixed top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-bg-card/90 border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="min-h-full flex items-center justify-center p-8">
          <img
            src={preview}
            alt={isZh ? '原图' : 'Full size'}
            onClick={(e) => e.stopPropagation()}
            className="max-w-none cursor-default"
          />
        </div>
      </div>
    )}
    </>
  );
}
