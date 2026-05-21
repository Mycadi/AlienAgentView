use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_input_filter_words")]
    pub input_filter_words: Vec<String>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: u32,
    #[serde(default = "default_terminal_command")]
    pub terminal_command: String,
    #[serde(default = "default_claude_dir")]
    pub claude_dir: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            input_filter_words: default_input_filter_words(),
            language: default_language(),
            refresh_interval: default_refresh_interval(),
            terminal_command: default_terminal_command(),
            claude_dir: default_claude_dir(),
        }
    }
}

fn default_input_filter_words() -> Vec<String> {
    vec!["确认".to_string(), "继续".to_string(), "改吧".to_string()]
}

fn default_language() -> String {
    "zh-CN".to_string()
}

fn default_refresh_interval() -> u32 {
    3
}

fn default_terminal_command() -> String {
    "acode".to_string()
}

fn default_claude_dir() -> String {
    "~/.claude".to_string()
}

fn config_file() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {e}"))?;
    let dir = exe.parent().ok_or_else(|| "Failed to get exe directory".to_string())?;
    Ok(dir.join("settings.json"))
}

fn load() -> AppSettings {
    let Ok(path) = config_file() else { return AppSettings::default() };
    let Ok(text) = fs::read_to_string(&path) else { return AppSettings::default() };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save(data: &AppSettings) -> Result<(), String> {
    let path = config_file()?;
    let text = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("Failed to write settings.json: {e}"))
}

fn normalize_words(words: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for word in words {
        let word = word.trim().to_string();
        if !word.is_empty() && !normalized.contains(&word) {
            normalized.push(word);
        }
    }
    normalized
}

/// If settings.json does not exist next to the exe, create it with defaults.
pub fn ensure_config_file() {
    if let Ok(path) = config_file() {
        if !path.exists() {
            let _ = save(&AppSettings::default());
        }
    }
}

#[tauri::command]
pub fn get_app_settings() -> AppSettings {
    load()
}

#[tauri::command]
pub fn set_input_filter_words(words: Vec<String>) -> Result<AppSettings, String> {
    let mut data = load();
    data.input_filter_words = normalize_words(words);
    save(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn update_app_settings(
    language: Option<String>,
    refresh_interval: Option<u32>,
    terminal_command: Option<String>,
    claude_dir: Option<String>,
    input_filter_words: Option<Vec<String>>,
) -> Result<AppSettings, String> {
    let mut data = load();
    if let Some(v) = language {
        data.language = v;
    }
    if let Some(v) = refresh_interval {
        data.refresh_interval = v;
    }
    if let Some(v) = terminal_command {
        data.terminal_command = v;
    }
    if let Some(v) = claude_dir {
        data.claude_dir = v;
    }
    if let Some(v) = input_filter_words {
        data.input_filter_words = normalize_words(v);
    }
    save(&data)?;
    Ok(data)
}
