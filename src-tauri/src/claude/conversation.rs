use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, HashSet, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use super::session::SessionStatus;

fn get_claude_dir() -> PathBuf {
    crate::app_settings::resolve_claude_dir()
}

const CONTEXT_TOKEN_LIMIT: u64 = 200_000;
const STATUS_SCAN_LINES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInput {
    pub timestamp: Option<String>,
    pub content: String,
}

pub fn get_session_inputs(
    project_dir_name: &str,
    session_id: &str,
    input_filter_words: &[String],
) -> Vec<SessionInput> {
    let jsonl_path = get_claude_dir()
        .join("projects")
        .join(project_dir_name)
        .join(format!("{}.jsonl", session_id));

    let file = match fs::File::open(jsonl_path) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);
    reader
        .lines()
        .filter_map(|line| line.ok())
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .filter(is_user_llm_prompt)
        .filter_map(|msg| {
            let content = msg.pointer("/message/content")?.as_str()?.to_string();
            if should_hide_input(&content, input_filter_words) {
                return None;
            }
            Some(SessionInput {
                timestamp: msg
                    .get("timestamp")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                content,
            })
        })
        .collect()
}

/// Returns (status, last_activity_description, current_file, total_tokens, context_percentage, modified_files, is_interacting)
pub fn get_session_status(
    project_dir_name: &str,
    session_id: &str,
) -> (SessionStatus, Option<String>, Option<String>, u64, u8, Vec<String>, bool) {
    let jsonl_path = get_claude_dir()
        .join("projects")
        .join(project_dir_name)
        .join(format!("{}.jsonl", session_id));

    if !jsonl_path.exists() {
        return (SessionStatus::Working, None, None, 0, 0, Vec::new(), false);
    }

    // Read enough recent messages to pair tool_use with tool_result.
    let last_messages = read_last_lines(&jsonl_path, STATUS_SCAN_LINES);
    if last_messages.is_empty() {
        return (SessionStatus::Working, None, None, 0, 0, Vec::new(), false);
    }

    let mut status = SessionStatus::Working;
    let mut last_activity: Option<String> = None;
    let mut current_file: Option<String> = None;
    let mut total_tokens: u64 = 0;
    let mut context_tokens: u64 = 0;
    let mut has_pending_prompt = false;
    let mut assistant_active = false;
    let mut pending_tool_uses = HashSet::new();
    let mut modified_files_set = BTreeSet::new();
    let mut has_api_error = false;

    // Process all messages to aggregate tokens and find latest status
    for line in &last_messages {
        let Ok(msg) = serde_json::from_str::<Value>(line) else {
            // Only treat non-JSON lines containing "API Error:" as errors
            if line.contains("API Error:") {
                has_api_error = true;
            }
            continue;
        };

        // Collect modified files from this message
        collect_modified_files_from_value(&msg, &mut modified_files_set);

        let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match msg_type {
            "assistant" => {
                // Extract token usage
                if let Some(usage) = msg.pointer("/message/usage") {
                    let input = usage
                        .get("input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let output = usage
                        .get("output_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let cache_creation = usage
                        .get("cache_creation_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let cache_read = usage
                        .get("cache_read_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    total_tokens += input + output;
                    context_tokens = input + cache_creation + cache_read;
                }

                // Check stop reason for status
                let stop_reason = msg
                    .pointer("/message/stop_reason")
                    .and_then(|v| v.as_str());

                match stop_reason {
                    Some("end_turn") => {
                        assistant_active = false;
                        status = SessionStatus::NeedsInput;
                        has_pending_prompt = false;
                        has_api_error = false;
                    }
                    Some("tool_use") => {
                        assistant_active = true;
                        status = SessionStatus::Working;
                        has_pending_prompt = false;
                        has_api_error = false;
                    }
                    _ => {
                        // Streaming chunk with no stop_reason — don't change status
                    }
                }

                // Extract last activity from text content
                if let Some(content) = msg.pointer("/message/content") {
                    if let Some(arr) = content.as_array() {
                        for item in arr {
                            if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                                if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                                    let summary = text.chars().take(80).collect::<String>();
                                    last_activity = Some(summary);
                                }
                            }
                            // Extract current file from tool use and track pending tools
                            if item.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                                if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                                    pending_tool_uses.insert(id.to_string());
                                }
                                if let Some(input) = item.get("input") {
                                    if let Some(fp) =
                                        input.get("file_path").and_then(|v| v.as_str())
                                    {
                                        current_file = Some(fp.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "user" => {
                remove_completed_tool_uses(&msg, &mut pending_tool_uses);
                if is_user_llm_prompt(&msg) {
                    status = SessionStatus::Working;
                    has_pending_prompt = true;
                    assistant_active = false;
                    if let Some(content) = msg.pointer("/message/content") {
                        if let Some(text) = content.as_str() {
                            let summary = text.chars().take(80).collect::<String>();
                            last_activity = Some(format!("User: {}", summary));
                        }
                    }
                }
            }
            "last-prompt" => {
                // Only mark as pending if content is an actual LLM prompt
                let content = msg.pointer("/message/content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !content.is_empty()
                    && !is_local_or_control_content(content)
                    && !is_basic_local_command(content)
                {
                    status = SessionStatus::Working;
                    has_pending_prompt = true;
                }
            }
            _ => {}
        }
    }

    let has_pending_tools = !pending_tool_uses.is_empty();
    if has_api_error && !has_pending_prompt && !has_pending_tools && !assistant_active {
        status = SessionStatus::Error;
    } else if has_pending_prompt || has_pending_tools || assistant_active {
        status = SessionStatus::Working;
    } else if status == SessionStatus::Working {
        status = SessionStatus::NeedsInput;
    }

    let context_percentage = ((context_tokens.saturating_mul(100)) / CONTEXT_TOKEN_LIMIT).min(100) as u8;
    let is_interacting = status == SessionStatus::Working
        && (has_pending_prompt || has_pending_tools || assistant_active);

    let modified_files: Vec<String> = modified_files_set.into_iter().collect();

    (status, last_activity, current_file, total_tokens, context_percentage, modified_files, is_interacting)
}

fn remove_completed_tool_uses(msg: &Value, pending_tool_uses: &mut HashSet<String>) {
    if let Some(items) = msg.pointer("/message/content").and_then(|content| content.as_array()) {
        for item in items {
            if item.get("type").and_then(|v| v.as_str()) == Some("tool_result") {
                if let Some(id) = item.get("tool_use_id").and_then(|v| v.as_str()) {
                    pending_tool_uses.remove(id);
                }
            }
        }
    }
}

fn should_hide_input(content: &str, input_filter_words: &[String]) -> bool {
    let content = content.trim();
    input_filter_words.iter().any(|word| word.trim() == content)
}

fn is_user_llm_prompt(msg: &Value) -> bool {
    let is_meta = msg.get("isMeta").and_then(|value| value.as_bool()).unwrap_or(false);
    if is_meta {
        return false;
    }

    let Some(content) = msg.pointer("/message/content").and_then(|value| value.as_str()) else {
        return false;
    };

    !is_local_or_control_content(content) && !is_basic_local_command(content)
}

fn is_local_or_control_content(content: &str) -> bool {
    [
        "<command-name>",
        "<local-command-stdout>",
        "<local-command-stderr>",
        "<local-command-caveat>",
        "<system-reminder>",
        "<task-notification>",
    ]
    .iter()
    .any(|marker| content.contains(marker))
}

fn is_basic_local_command(content: &str) -> bool {
    let trimmed = content.trim();
    matches!(trimmed, "/model" | "/apikey" | "/context")
        || trimmed.starts_with("/model ")
        || trimmed.starts_with("/apikey ")
        || trimmed.starts_with("/context ")
        || content.contains("<command-name>/model</command-name>")
        || content.contains("<command-name>/apikey</command-name>")
        || content.contains("<command-name>/context</command-name>")
}

fn collect_modified_files_from_value(value: &Value, files: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            let name = map
                .get("name")
                .or_else(|| map.get("tool_name"))
                .and_then(|value| value.as_str())
                .unwrap_or("");

            if is_modify_tool(name) {
                if let Some(file_path) = map
                    .get("input")
                    .and_then(|input| input.get("file_path").or_else(|| input.get("notebook_path")))
                    .and_then(|value| value.as_str())
                {
                    files.insert(file_path.to_string());
                }
            }

            for child in map.values() {
                collect_modified_files_from_value(child, files);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_modified_files_from_value(item, files);
            }
        }
        _ => {}
    }
}

fn is_modify_tool(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "edit" | "write" | "notebookedit")
}

fn read_last_lines(path: &PathBuf, n: usize) -> Vec<String> {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);
    let mut ring = VecDeque::with_capacity(n + 1);

    for line in reader.lines().filter_map(|l| l.ok()) {
        if line.trim().is_empty() {
            continue;
        }
        if ring.len() == n {
            ring.pop_front();
        }
        ring.push_back(line);
    }

    ring.into_iter().collect()
}
