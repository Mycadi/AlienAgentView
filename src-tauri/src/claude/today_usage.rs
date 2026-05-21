use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

fn get_projects_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("projects")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayUsage {
    pub total_tokens: u64,
}

pub fn get_today_usage() -> TodayUsage {
    let today = Local::now().date_naive();
    let root = get_projects_dir();
    let mut total: u64 = 0;

    let mut jsonl_files: Vec<PathBuf> = Vec::new();
    collect_jsonl_files(&root, &mut jsonl_files, 0);

    let today_start_local = today.and_hms_opt(0, 0, 0);
    for path in jsonl_files {
        // mtime 早于今天 0 点的文件直接跳过（性能优化，可安全跳过）
        if let (Ok(meta), Some(_today_start)) = (fs::metadata(&path), today_start_local) {
            if let Ok(mtime) = meta.modified() {
                let mtime_dt: DateTime<Local> = mtime.into();
                if mtime_dt.date_naive() < today {
                    continue;
                }
            }
        }

        total = total.saturating_add(sum_today_tokens_in_file(&path, today));
    }

    TodayUsage {
        total_tokens: total,
    }
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

fn sum_today_tokens_in_file(path: &Path, today: chrono::NaiveDate) -> u64 {
    let Ok(file) = File::open(path) else {
        return 0;
    };
    let reader = BufReader::new(file);
    let mut sum: u64 = 0;

    for line in reader.lines().map_while(Result::ok) {
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };

        // 判断是否今天（按本地时区）
        let ts = v.get("timestamp").and_then(|t| t.as_str());
        let Some(ts) = ts else { continue };
        let Ok(parsed) = DateTime::parse_from_rfc3339(ts) else {
            continue;
        };
        if parsed.with_timezone(&Local).date_naive() != today {
            continue;
        }

        let usage = v
            .get("message")
            .and_then(|m| m.get("usage"))
            .and_then(|u| u.as_object());
        let Some(usage) = usage else { continue };

        let get_u64 = |k: &str| usage.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
        sum = sum.saturating_add(get_u64("input_tokens"));
        sum = sum.saturating_add(get_u64("output_tokens"));
        sum = sum.saturating_add(get_u64("cache_read_input_tokens"));
        sum = sum.saturating_add(get_u64("cache_creation_input_tokens"));
    }

    sum
}
