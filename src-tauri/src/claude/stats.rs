use chrono::{DateTime, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

fn get_claude_dir() -> PathBuf {
    crate::app_settings::resolve_claude_dir()
}

fn get_app_cache_path() -> PathBuf {
    get_claude_dir()
        .join("alien-agent-view")
        .join("stats-cache.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub total_sessions: u64,
    pub total_messages: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub today_tokens: u64,
    pub today_messages: u64,
    pub daily_activity: Vec<DailyActivity>,
    pub last_computed_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivity {
    pub date: String,
    pub message_count: u64,
    pub session_count: u64,
    pub tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatsCache {
    overview: StatsOverview,
    files: HashMap<String, CachedFileStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedFileStats {
    modified_ms: u64,
    size: u64,
    stats: StatsOverview,
}

pub fn get_stats() -> StatsOverview {
    read_stats_file(&get_app_cache_path()).unwrap_or_else(|| {
        read_stats_file(&get_claude_dir().join("stats-cache.json")).unwrap_or_else(empty_overview)
    })
}

pub fn refresh_stats_cache() -> Result<StatsOverview, String> {
    let cache = compute_full_cache()
        .ok_or_else(|| "No Claude project sessions found".to_string())?;
    write_stats_cache(&cache)?;
    Ok(cache.overview)
}

pub fn refresh_stats_cache_incremental() -> Result<StatsOverview, String> {
    let mut cache = read_app_cache().unwrap_or(StatsCache {
        overview: empty_overview(),
        files: HashMap::new(),
    });
    let projects_dir = get_claude_dir().join("projects");
    let mut jsonl_files = Vec::new();
    collect_jsonl_files(&projects_dir, &mut jsonl_files, 0);
    if jsonl_files.is_empty() {
        return Err("No Claude project sessions found".to_string());
    }

    let mut seen = std::collections::HashSet::new();
    for path in jsonl_files {
        let key = path.to_string_lossy().to_string();
        seen.insert(key.clone());
        let Some((modified_ms, size)) = file_signature(&path) else {
            continue;
        };
        let unchanged = cache
            .files
            .get(&key)
            .map(|cached| cached.modified_ms == modified_ms && cached.size == size)
            .unwrap_or(false);
        if unchanged {
            continue;
        }
        cache.files.insert(
            key,
            CachedFileStats {
                modified_ms,
                size,
                stats: scan_session_file(&path),
            },
        );
    }

    cache.files.retain(|path, _| seen.contains(path));
    cache.overview = aggregate_file_stats(cache.files.values().map(|file| &file.stats));
    write_stats_cache(&cache)?;
    Ok(cache.overview)
}

fn empty_overview() -> StatsOverview {
    StatsOverview {
        total_sessions: 0,
        total_messages: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_creation_tokens: 0,
        today_tokens: 0,
        today_messages: 0,
        daily_activity: Vec::new(),
        last_computed_date: None,
    }
}

fn read_app_cache() -> Option<StatsCache> {
    let content = fs::read_to_string(get_app_cache_path()).ok()?;
    serde_json::from_str::<StatsCache>(&content).ok()
}

fn read_stats_file(stats_path: &Path) -> Option<StatsOverview> {
    let content = fs::read_to_string(stats_path).ok()?;
    if let Ok(cache) = serde_json::from_str::<StatsCache>(&content) {
        return Some(cache.overview);
    }
    if let Ok(overview) = serde_json::from_str::<StatsOverview>(&content) {
        return Some(overview);
    }

    let mut overview = empty_overview();

    let stats = serde_json::from_str::<Value>(&content).ok()?;

    overview.last_computed_date = stats
        .get("lastComputedDate")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    overview.total_sessions = stats
        .get("totalSessions")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    overview.total_messages = stats
        .get("totalMessages")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

            // Aggregate model usage
            if let Some(model_usage) = stats.get("modelUsage").and_then(|v| v.as_object()) {
                for (_model, usage) in model_usage {
                    overview.total_input_tokens += usage
                        .get("inputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    overview.total_output_tokens += usage
                        .get("outputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    overview.total_cache_read_tokens += usage
                        .get("cacheReadInputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    overview.total_cache_creation_tokens += usage
                        .get("cacheCreationInputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                }
            }

            // Daily activity
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();

            if let Some(daily) = stats.get("dailyActivity").and_then(|v| v.as_array()) {
                for day in daily.iter().rev().take(30) {
                    let date = day
                        .get("date")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let message_count = day
                        .get("messageCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let session_count = day
                        .get("sessionCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);

                    if date == today {
                        overview.today_messages = message_count;
                    }

                    overview.daily_activity.push(DailyActivity {
                        date,
                        message_count,
                        session_count,
                        tokens: 0,
                    });
                }
            }

            // Daily tokens
            if let Some(daily_tokens) = stats.get("dailyModelTokens").and_then(|v| v.as_array()) {
                let tokens_by_date: HashMap<String, u64> = daily_tokens
                    .iter()
                    .filter_map(|d| {
                        let date = d.get("date")?.as_str()?.to_string();
                        let tokens_map = d.get("tokensByModel")?.as_object()?;
                        let total: u64 = tokens_map.values().filter_map(|v| v.as_u64()).sum();
                        Some((date, total))
                    })
                    .collect();

                if let Some(&today_t) = tokens_by_date.get(&today) {
                    overview.today_tokens = today_t;
                }

                for activity in &mut overview.daily_activity {
                    if let Some(&t) = tokens_by_date.get(&activity.date) {
                        activity.tokens = t;
                    }
                }
            }

    Some(overview)
}

fn compute_full_cache() -> Option<StatsCache> {
    let projects_dir = get_claude_dir().join("projects");
    let mut jsonl_files = Vec::new();
    collect_jsonl_files(&projects_dir, &mut jsonl_files, 0);
    if jsonl_files.is_empty() {
        return None;
    }

    let mut files = HashMap::new();
    for path in jsonl_files {
        let Some((modified_ms, size)) = file_signature(&path) else {
            continue;
        };
        files.insert(
            path.to_string_lossy().to_string(),
            CachedFileStats {
                modified_ms,
                size,
                stats: scan_session_file(&path),
            },
        );
    }

    let overview = aggregate_file_stats(files.values().map(|file| &file.stats));
    Some(StatsCache { overview, files })
}

fn write_stats_cache(cache: &StatsCache) -> Result<(), String> {
    let cache_path = get_app_cache_path();
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create stats cache dir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize stats cache: {e}"))?;
    fs::write(&cache_path, text).map_err(|e| format!("Failed to write stats cache: {e}"))
}

fn collect_jsonl_files(dir: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if depth > 4 {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, out, depth + 1);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

fn scan_session_file(path: &Path) -> StatsOverview {
    let today = Local::now().date_naive();
    let mut overview = empty_overview();
    let mut daily: BTreeMap<String, DailyActivity> = BTreeMap::new();
    let mut latest_date: Option<NaiveDate> = None;
    let mut session_dates = std::collections::HashSet::new();

    overview.total_sessions = 1;

    let Ok(file) = File::open(path) else {
        return overview;
    };
    let reader = BufReader::new(file);

    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };

        let date = line_date(&v);
        if let Some(date) = date {
            if latest_date.map_or(true, |latest| date > latest) {
                latest_date = Some(date);
            }
            session_dates.insert(date.format("%Y-%m-%d").to_string());
        }

        let msg_type = v.get("type").and_then(|t| t.as_str());
        if matches!(msg_type, Some("user") | Some("assistant")) {
            overview.total_messages = overview.total_messages.saturating_add(1);
            if let Some(date) = date {
                let activity = daily_activity_for(&mut daily, date);
                activity.message_count = activity.message_count.saturating_add(1);
                if date == today {
                    overview.today_messages = overview.today_messages.saturating_add(1);
                }
            }
        }

        let Some(usage) = v.pointer("/message/usage") else {
            continue;
        };
        let input = get_usage_u64(usage, "input_tokens");
        let output = get_usage_u64(usage, "output_tokens");
        let cache_read = get_usage_u64(usage, "cache_read_input_tokens");
        let cache_creation = get_usage_u64(usage, "cache_creation_input_tokens");
        let tokens = input
            .saturating_add(output)
            .saturating_add(cache_read)
            .saturating_add(cache_creation);

        overview.total_input_tokens = overview.total_input_tokens.saturating_add(input);
        overview.total_output_tokens = overview.total_output_tokens.saturating_add(output);
        overview.total_cache_read_tokens = overview.total_cache_read_tokens.saturating_add(cache_read);
        overview.total_cache_creation_tokens = overview
            .total_cache_creation_tokens
            .saturating_add(cache_creation);

        if let Some(date) = date {
            let activity = daily_activity_for(&mut daily, date);
            activity.tokens = activity.tokens.saturating_add(tokens);
            if date == today {
                overview.today_tokens = overview.today_tokens.saturating_add(tokens);
            }
        }
    }

    for date_key in session_dates {
        let activity = daily.entry(date_key.clone()).or_insert(DailyActivity {
            date: date_key,
            message_count: 0,
            session_count: 0,
            tokens: 0,
        });
        activity.session_count = activity.session_count.saturating_add(1);
    }

    overview.daily_activity = daily.into_values().collect();
    overview.last_computed_date = latest_date.map(|d| d.format("%Y-%m-%d").to_string());
    overview
}

fn aggregate_file_stats<'a>(files: impl Iterator<Item = &'a StatsOverview>) -> StatsOverview {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut overview = empty_overview();
    let mut daily: BTreeMap<String, DailyActivity> = BTreeMap::new();

    for file in files {
        overview.total_sessions = overview.total_sessions.saturating_add(file.total_sessions);
        overview.total_messages = overview.total_messages.saturating_add(file.total_messages);
        overview.total_input_tokens = overview
            .total_input_tokens
            .saturating_add(file.total_input_tokens);
        overview.total_output_tokens = overview
            .total_output_tokens
            .saturating_add(file.total_output_tokens);
        overview.total_cache_read_tokens = overview
            .total_cache_read_tokens
            .saturating_add(file.total_cache_read_tokens);
        overview.total_cache_creation_tokens = overview
            .total_cache_creation_tokens
            .saturating_add(file.total_cache_creation_tokens);

        if let Some(date) = &file.last_computed_date {
            if overview
                .last_computed_date
                .as_ref()
                .map_or(true, |latest| date > latest)
            {
                overview.last_computed_date = Some(date.clone());
            }
        }

        for day in &file.daily_activity {
            let activity = daily.entry(day.date.clone()).or_insert(DailyActivity {
                date: day.date.clone(),
                message_count: 0,
                session_count: 0,
                tokens: 0,
            });
            activity.message_count = activity.message_count.saturating_add(day.message_count);
            activity.session_count = activity.session_count.saturating_add(day.session_count);
            activity.tokens = activity.tokens.saturating_add(day.tokens);
        }
    }

    if let Some(activity) = daily.get(&today) {
        overview.today_messages = activity.message_count;
        overview.today_tokens = activity.tokens;
    }

    overview.daily_activity = daily.into_values().rev().take(365).collect();
    overview.daily_activity.reverse();
    overview
}

fn file_signature(path: &Path) -> Option<(u64, u64)> {
    let metadata = fs::metadata(path).ok()?;
    let modified_ms = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some((modified_ms, metadata.len()))
}

fn daily_activity_for(
    daily: &mut BTreeMap<String, DailyActivity>,
    date: NaiveDate,
) -> &mut DailyActivity {
    let date_key = date.format("%Y-%m-%d").to_string();
    daily.entry(date_key.clone()).or_insert(DailyActivity {
        date: date_key,
        message_count: 0,
        session_count: 0,
        tokens: 0,
    })
}

fn line_date(v: &Value) -> Option<NaiveDate> {
    let ts = v.get("timestamp")?.as_str()?;
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
}

fn get_usage_u64(usage: &Value, key: &str) -> u64 {
    usage.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}
