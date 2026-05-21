use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_input_filter_words")]
    pub input_filter_words: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            input_filter_words: default_input_filter_words(),
        }
    }
}

fn default_input_filter_words() -> Vec<String> {
    vec!["确认".to_string(), "继续".to_string(), "改吧".to_string()]
}

fn config_file() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or_else(|| "Failed to locate config dir".to_string())?;
    let dir = base.join("AlienAgentView");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
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
