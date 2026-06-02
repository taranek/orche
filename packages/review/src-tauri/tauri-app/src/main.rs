//! Tauri shell for the orche review app.
//!
//! Every command is a thin wrapper over orche_review_core — the contract-tested
//! backend. The renderer (src/lib/reviewClient.ts) calls these by name via the
//! global __TAURI__ bridge; Tauri converts camelCase JS arg keys (filePath) to
//! snake_case command params (file_path) automatically.
//!
//! Startup mirrors electron/main.ts: parse --worktree / --base from argv,
//! resolve the base ref, hold it (plus the delivery target) in managed state.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use orche_review_core as core;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

/// Per-session config, resolved once at startup. Equivalent to the module-level
/// worktreePath / baseRef / agent* values in electron/main.ts.
struct AppState {
    worktree: String,
    base: String,
    target: core::SubmitTarget,
}

#[tauri::command]
fn get_changes(state: State<AppState>, range: core::Range) -> Vec<core::FileChange> {
    core::get_changed_files(&state.worktree, &state.base, &range)
}

#[tauri::command]
fn get_commits(state: State<AppState>) -> Vec<core::CommitInfo> {
    core::get_commits(&state.worktree, &state.base)
}

#[tauri::command]
fn get_branch(state: State<AppState>) -> Option<String> {
    core::get_branch(&state.worktree)
}

#[tauri::command]
fn read_original(state: State<AppState>, file_path: String, range: core::Range) -> Option<String> {
    core::read_original(&state.worktree, &state.base, &range, &file_path)
}

#[tauri::command]
fn read_modified(state: State<AppState>, file_path: String, range: core::Range) -> String {
    core::read_modified(&state.worktree, &state.base, &range, &file_path)
}

#[tauri::command]
fn read_original_base64(state: State<AppState>, file_path: String, range: core::Range) -> Option<String> {
    core::read_original_base64(&state.worktree, &state.base, &range, &file_path)
}

#[tauri::command]
fn read_modified_base64(state: State<AppState>, file_path: String, range: core::Range) -> Option<String> {
    core::read_modified_base64(&state.worktree, &state.base, &range, &file_path)
}

#[tauri::command]
fn write_file(state: State<AppState>, file_path: String, content: String) -> Result<(), String> {
    let full = std::path::Path::new(&state.worktree).join(&file_path);
    std::fs::write(full, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn submit_review(state: State<AppState>, markdown: String) -> core::SubmitResult {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    match core::submit_review(&state.worktree, &markdown, &state.target, now) {
        Ok(r) => r,
        Err(e) => core::SubmitResult {
            success: false,
            path: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn arg_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .find_map(|a| a.strip_prefix(flag).map(|v| v.to_string()))
}

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    let worktree = arg_value(&argv, "--worktree=")
        .or_else(|| argv.last().cloned())
        .unwrap_or_default();
    let explicit_base = arg_value(&argv, "--base=");
    let base = core::resolve_base(&worktree, explicit_base.as_deref());

    // Delivery target for submitted reviews. The full session.json wiring from
    // electron/main.ts can be ported here; argv flags cover the common case.
    let target = core::SubmitTarget {
        multiplexer: arg_value(&argv, "--tmux=")
            .map(|_| "tmux".to_string())
            .or_else(|| arg_value(&argv, "--surface=").map(|_| "cmux".to_string())),
        pane_id: arg_value(&argv, "--tmux=").or_else(|| arg_value(&argv, "--surface=")),
        workspace_id: None,
    };

    tauri::Builder::default()
        .setup(move |app| {
            app.manage(AppState { worktree, base, target });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_changes,
            get_commits,
            get_branch,
            read_original,
            read_modified,
            read_original_base64,
            read_modified_base64,
            write_file,
            submit_review,
            quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
