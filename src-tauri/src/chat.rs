use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

/// Cancellation token for the in-flight chat stream, if any.
static CHAT_CANCEL: LazyLock<Mutex<Option<CancellationToken>>> =
    LazyLock::new(|| Mutex::new(None));

// ---------------- Data types ----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModelConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
}

impl Default for ChatModelConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            model: default_model(),
        }
    }
}

fn default_base_url() -> String {
    "https://api.openai.com".to_string()
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

/// All-empty config, so unset vision fields fall back to the chat model.
fn empty_model_config() -> ChatModelConfig {
    ChatModelConfig { base_url: String::new(), api_key: String::new(), model: String::new() }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRole {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub system_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfig {
    #[serde(default)]
    pub model: ChatModelConfig,
    /// Optional. Empty fields fall back to `model`.
    #[serde(default = "empty_model_config")]
    pub vision_model: ChatModelConfig,
    #[serde(default)]
    pub roles: Vec<ChatRole>,
    #[serde(default)]
    pub default_role_id: String,
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self {
            model: ChatModelConfig::default(),
            vision_model: empty_model_config(),
            roles: Vec::new(),
            default_role_id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    /// Base64 data URLs of attached images.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<String>,
    #[serde(default)]
    pub timestamp: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversation {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub role_id: String,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

// ---------------- File helpers ----------------

fn file_beside_exe(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {e}"))?;
    let dir = exe.parent().ok_or_else(|| "Failed to get exe directory".to_string())?;
    Ok(dir.join(name))
}

fn load_config() -> ChatConfig {
    let Ok(path) = file_beside_exe("chat_config.json") else { return ChatConfig::default() };
    let Ok(text) = fs::read_to_string(&path) else { return ChatConfig::default() };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_config(data: &ChatConfig) -> Result<(), String> {
    let path = file_beside_exe("chat_config.json")?;
    let text = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize chat config: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Failed to write chat_config.json: {e}"))
}

fn load_conversations() -> Vec<ChatConversation> {
    let Ok(path) = file_beside_exe("chat_history.json") else { return Vec::new() };
    let Ok(text) = fs::read_to_string(&path) else { return Vec::new() };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_conversations(data: &[ChatConversation]) -> Result<(), String> {
    let path = file_beside_exe("chat_history.json")?;
    let text = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize chat history: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Failed to write chat_history.json: {e}"))
}

// ---------------- Config commands ----------------

#[tauri::command]
pub fn get_chat_config() -> ChatConfig {
    load_config()
}

#[tauri::command]
pub fn update_chat_config(
    model: Option<ChatModelConfig>,
    vision_model: Option<ChatModelConfig>,
    roles: Option<Vec<ChatRole>>,
    default_role_id: Option<String>,
) -> Result<ChatConfig, String> {
    let mut data = load_config();
    if let Some(v) = model {
        data.model = v;
    }
    if let Some(v) = vision_model {
        data.vision_model = v;
    }
    if let Some(v) = roles {
        data.roles = v;
    }
    if let Some(v) = default_role_id {
        data.default_role_id = v;
    }
    save_config(&data)?;
    Ok(data)
}

// ---------------- History commands ----------------

#[tauri::command]
pub fn get_chat_conversations() -> Vec<ChatConversation> {
    load_conversations()
}

#[tauri::command]
pub fn save_chat_conversation(conversation: ChatConversation) -> Result<(), String> {
    let mut list = load_conversations();
    if let Some(existing) = list.iter_mut().find(|c| c.id == conversation.id) {
        *existing = conversation;
    } else {
        list.push(conversation);
    }
    save_conversations(&list)
}

#[tauri::command]
pub fn delete_chat_conversation(id: String) -> Result<(), String> {
    let mut list = load_conversations();
    list.retain(|c| c.id != id);
    save_conversations(&list)
}

// ---------------- Streaming send ----------------

/// Vision config with each empty field falling back to the chat model.
fn resolve_vision(config: &ChatConfig) -> ChatModelConfig {
    let v = &config.vision_model;
    let m = &config.model;
    let pick = |a: &str, b: &str| {
        if a.trim().is_empty() { b.trim().to_string() } else { a.trim().to_string() }
    };
    ChatModelConfig {
        base_url: pick(&v.base_url, &m.base_url),
        api_key: pick(&v.api_key, &m.api_key),
        model: pick(&v.model, &m.model),
    }
}

/// OpenAI message content: plain string, or multimodal array when images exist.
fn message_content(m: &ChatMessage) -> serde_json::Value {
    if m.images.is_empty() {
        return serde_json::Value::String(m.content.clone());
    }
    let mut parts: Vec<serde_json::Value> = Vec::new();
    if !m.content.trim().is_empty() {
        parts.push(serde_json::json!({ "type": "text", "text": m.content }));
    }
    for url in &m.images {
        parts.push(serde_json::json!({
            "type": "image_url",
            "image_url": { "url": url },
        }));
    }
    serde_json::Value::Array(parts)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamPayload {
    conv_id: String,
    delta: String,
    done: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    conv_id: String,
    message: String,
}

#[tauri::command]
pub async fn chat_send(
    app: tauri::AppHandle,
    conv_id: String,
    role_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let config = load_config();
    let has_images = messages.iter().any(|m| !m.images.is_empty());
    let model = if has_images { resolve_vision(&config) } else { config.model.clone() };

    if model.api_key.trim().is_empty() {
        return Err("未配置 API Key，请在设置中填写".to_string());
    }

    // Build message array with optional system prompt from the selected role.
    let mut body_messages: Vec<serde_json::Value> = Vec::new();
    if let Some(role) = config.roles.iter().find(|r| r.id == role_id) {
        if !role.system_prompt.trim().is_empty() {
            body_messages.push(serde_json::json!({
                "role": "system",
                "content": role.system_prompt,
            }));
        }
    }
    for m in &messages {
        body_messages.push(serde_json::json!({
            "role": m.role,
            "content": message_content(m),
        }));
    }

    let base = model.base_url.trim_end_matches('/');
    let url = if base.ends_with("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") {
        format!("{base}/chat/completions")
    } else {
        format!("{base}/v1/chat/completions")
    };
    let body = serde_json::json!({
        "model": model.model,
        "messages": body_messages,
        "stream": true,
    });

    // Register a cancel token for this stream so chat_stop can interrupt it.
    let cancel = CancellationToken::new();
    {
        let mut guard = CHAT_CANCEL.lock().await;
        *guard = Some(cancel.clone());
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", model.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let msg = format!("HTTP {status}: {text}");
        let _ = app.emit(
            "chat-error",
            ErrorPayload { conv_id: conv_id.clone(), message: msg.clone() },
        );
        return Err(msg);
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    loop {
        // Race the next stream chunk against cancellation.
        let chunk = tokio::select! {
            _ = cancel.cancelled() => {
                let _ = app.emit(
                    "chat-stream",
                    StreamPayload { conv_id: conv_id.clone(), delta: String::new(), done: true },
                );
                return Ok(());
            }
            next = stream.next() => match next {
                Some(Ok(c)) => c,
                Some(Err(e)) => {
                    let msg = format!("流读取失败: {e}");
                    let _ = app.emit(
                        "chat-error",
                        ErrorPayload { conv_id: conv_id.clone(), message: msg.clone() },
                    );
                    return Err(msg);
                }
                None => break,
            }
        };
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines separated by newlines.
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer.drain(..=pos);

            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line[5..].trim();
            if data == "[DONE]" {
                let _ = app.emit(
                    "chat-stream",
                    StreamPayload { conv_id: conv_id.clone(), delta: String::new(), done: true },
                );
                return Ok(());
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                    if !delta.is_empty() {
                        let _ = app.emit(
                            "chat-stream",
                            StreamPayload {
                                conv_id: conv_id.clone(),
                                delta: delta.to_string(),
                                done: false,
                            },
                        );
                    }
                }
            }
        }
    }

    // Stream ended without explicit [DONE].
    let _ = app.emit(
        "chat-stream",
        StreamPayload { conv_id: conv_id.clone(), delta: String::new(), done: true },
    );
    Ok(())
}

/// Stop the in-flight chat stream, if any. No-op when idle.
#[tauri::command]
pub async fn chat_stop() -> Result<(), String> {
    let mut guard = CHAT_CANCEL.lock().await;
    if let Some(token) = guard.take() {
        token.cancel();
    }
    Ok(())
}
