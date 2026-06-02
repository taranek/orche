//! Git-backed review backend, ported from the electron `git.ts`.
//!
//! This is the Rust implementation a Tauri build would call. It is deliberately
//! a behavioral mirror of git.ts: same git invocations, same parsing, same
//! fallbacks. The TypeScript contract suite (contract/review-contract.ts) drives
//! the `review-contract-cli` binary and asserts identical results to electron —
//! green on both backends proves the migration preserved behavior.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Modified,
    Added,
    Deleted,
}

#[derive(Debug, Serialize)]
pub struct FileChange {
    pub path: String,
    pub name: String,
    pub status: ChangeStatus,
}

/// What slice of history to review. Mirrors the TS discriminated union
/// `{ kind: 'all' | 'working' | 'commit', sha? }`.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Range {
    All,
    Working,
    Commit { sha: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub date: String,
}

struct Resolved {
    diff_arg: String,
    origin_ref: String,
    modified_ref: Option<String>,
    include_untracked: bool,
}

/// Pure mapping from Range to the git refs each side touches — mirrors
/// resolveRange in git.ts.
fn resolve_range(range: &Range, base: &str) -> Resolved {
    match range {
        Range::Commit { sha } => Resolved {
            diff_arg: format!("{sha}^..{sha}"),
            origin_ref: format!("{sha}^"),
            modified_ref: Some(sha.clone()),
            include_untracked: false,
        },
        Range::Working => Resolved {
            diff_arg: "HEAD".into(),
            origin_ref: "HEAD".into(),
            modified_ref: None,
            include_untracked: true,
        },
        Range::All => Resolved {
            diff_arg: base.to_string(),
            origin_ref: base.to_string(),
            modified_ref: None,
            include_untracked: true,
        },
    }
}

/// Run git in `cwd`, returning stdout bytes on success (exit 0), else None.
fn git_bytes(cwd: &str, args: &[&str]) -> Option<Vec<u8>> {
    let out = Command::new("git").args(args).current_dir(cwd).output().ok()?;
    if out.status.success() {
        Some(out.stdout)
    } else {
        None
    }
}

fn git_str(cwd: &str, args: &[&str]) -> Option<String> {
    git_bytes(cwd, args).map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// Resolve the base ref: explicit wins, else probe origin/HEAD, main, master;
/// fall back to HEAD. Mirrors resolveBase in git.ts.
pub fn resolve_base(cwd: &str, explicit: Option<&str>) -> String {
    let mut candidates: Vec<String> = Vec::new();
    match explicit {
        Some(e) => candidates.push(e.to_string()),
        None => {
            if let Some(head) =
                git_str(cwd, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
            {
                let head = head.trim();
                candidates.push(head.strip_prefix("origin/").unwrap_or(head).to_string());
            }
            candidates.push("main".into());
            candidates.push("master".into());
        }
    }
    for r in &candidates {
        if git_bytes(cwd, &["rev-parse", "--verify", "--quiet", r]).is_some() {
            return r.clone();
        }
    }
    "HEAD".into()
}

/// List changed files for the range — `git diff --name-status` plus untracked
/// files when the working tree is in scope, deduped and codepoint-sorted.
pub fn get_changed_files(cwd: &str, base: &str, range: &Range) -> Vec<FileChange> {
    let r = resolve_range(range, base);
    // Preserve first-seen status per path (tracked wins over untracked), like the JS Map.
    let mut order: Vec<String> = Vec::new();
    let mut status_by_path: std::collections::HashMap<String, ChangeStatus> =
        std::collections::HashMap::new();

    if let Some(out) = git_str(cwd, &["diff", "--name-status", &r.diff_arg]) {
        for line in out.split('\n') {
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            let code = parts[0];
            let file_path = match parts.last() {
                Some(p) if !p.is_empty() => *p,
                _ => continue,
            };
            let status = if code.starts_with('A') {
                ChangeStatus::Added
            } else if code.starts_with('D') {
                ChangeStatus::Deleted
            } else {
                ChangeStatus::Modified
            };
            if !status_by_path.contains_key(file_path) {
                order.push(file_path.to_string());
            }
            status_by_path.insert(file_path.to_string(), status);
        }
    }

    if r.include_untracked {
        if let Some(out) = git_str(cwd, &["ls-files", "--others", "--exclude-standard"]) {
            for line in out.split('\n') {
                let file_path = line.trim();
                if file_path.is_empty() {
                    continue;
                }
                if !status_by_path.contains_key(file_path) {
                    order.push(file_path.to_string());
                    status_by_path.insert(file_path.to_string(), ChangeStatus::Added);
                }
            }
        }
    }

    let mut changes: Vec<FileChange> = order
        .into_iter()
        .map(|p| {
            let name = p.rsplit('/').next().filter(|s| !s.is_empty()).unwrap_or(&p).to_string();
            let status = status_by_path[&p];
            FileChange { path: p, name, status }
        })
        .collect();
    // Codepoint sort — matches the JS `a.path < b.path` comparator.
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    changes
}

/// List commits in base..HEAD, newest first. Mirrors getCommits in git.ts.
pub fn get_commits(cwd: &str, base: &str) -> Vec<CommitInfo> {
    let fmt = "--format=%H%x00%h%x00%s%x00%an%x00%ai";
    let revs = format!("{base}..HEAD");
    let out = match git_str(cwd, &["log", fmt, &revs]) {
        Some(o) => o,
        None => return Vec::new(),
    };
    out.split('\n')
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let f: Vec<&str> = line.split('\0').collect();
            if f.len() < 5 {
                return None;
            }
            Some(CommitInfo {
                sha: f[0].to_string(),
                short_sha: f[1].to_string(),
                subject: f[2].to_string(),
                author: f[3].to_string(),
                date: f[4].to_string(),
            })
        })
        .collect()
}

/// Current branch, or None when detached / not a repo.
pub fn get_branch(cwd: &str) -> Option<String> {
    git_str(cwd, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

/// "Before" version as text; None when the file didn't exist at the origin ref.
pub fn read_original(cwd: &str, base: &str, range: &Range, file_path: &str) -> Option<String> {
    let r = resolve_range(range, base);
    git_str(cwd, &["show", &format!("{}:{}", r.origin_ref, file_path)])
}

/// "After" version as text; "" on failure (e.g. deleted files).
pub fn read_modified(cwd: &str, base: &str, range: &Range, file_path: &str) -> String {
    let r = resolve_range(range, base);
    if let Some(ref_name) = r.modified_ref {
        return git_str(cwd, &["show", &format!("{ref_name}:{file_path}")]).unwrap_or_default();
    }
    let full = Path::new(cwd).join(file_path);
    if full.is_dir() {
        return String::new();
    }
    std::fs::read_to_string(&full).unwrap_or_default()
}

/// Base64 of the "before" version (binary files); None on miss.
pub fn read_original_base64(cwd: &str, base: &str, range: &Range, file_path: &str) -> Option<String> {
    let r = resolve_range(range, base);
    git_bytes(cwd, &["show", &format!("{}:{}", r.origin_ref, file_path)]).map(|b| STANDARD.encode(b))
}

/// Base64 of the "after" version (binary files); None on miss.
pub fn read_modified_base64(cwd: &str, base: &str, range: &Range, file_path: &str) -> Option<String> {
    let r = resolve_range(range, base);
    if let Some(ref_name) = r.modified_ref {
        return git_bytes(cwd, &["show", &format!("{ref_name}:{file_path}")]).map(|b| STANDARD.encode(b));
    }
    let full = Path::new(cwd).join(file_path);
    std::fs::read(&full).ok().map(|b| STANDARD.encode(b))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitTarget {
    // Serialized even when None (as null) to match the JS resolver, which
    // returns `multiplexer: null` rather than omitting it.
    pub multiplexer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingFile {
    review_path: String,
    // Always serialized (null when None) — matches the JS object literal where
    // multiplexer is present even when null.
    multiplexer: Option<String>,
    // Omitted when absent — matches JSON.stringify dropping `undefined`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// session.json as written by the orche CLI. `panes` is insertion-ordered
/// (serde_json preserve_order) so "first pane" matches the JS side.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    #[serde(default)]
    multiplexer: Option<String>,
    #[serde(default)]
    panes: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    workspace_id: Option<String>,
}

/// Resolve the delivery target from <worktree>/.orche/session.json plus optional
/// tmux/cmux flags. Mirrors resolveSubmitTarget in session.ts:
///   multiplexer = session.multiplexer ?? (tmux ? "tmux" : cmux ? "cmux" : null)
///   paneId      = tmux ?? cmux ?? first pane value in session.json
///   workspaceId = session.workspaceId
pub fn resolve_submit_target(
    worktree_path: &str,
    tmux_target: Option<&str>,
    cmux_surface: Option<&str>,
) -> SubmitTarget {
    let session: Option<SessionInfo> =
        std::fs::read_to_string(Path::new(worktree_path).join(".orche").join("session.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());

    let multiplexer = session
        .as_ref()
        .and_then(|s| s.multiplexer.clone())
        .or_else(|| {
            if tmux_target.is_some() {
                Some("tmux".to_string())
            } else if cmux_surface.is_some() {
                Some("cmux".to_string())
            } else {
                None
            }
        });

    let first_pane = session
        .as_ref()
        .and_then(|s| s.panes.values().next())
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let pane_id = tmux_target
        .map(|s| s.to_string())
        .or_else(|| cmux_surface.map(|s| s.to_string()))
        .or(first_pane);

    let workspace_id = session.as_ref().and_then(|s| s.workspace_id.clone());

    SubmitTarget {
        multiplexer,
        pane_id,
        workspace_id,
    }
}

/// Persist a review: write `<reviews>/<now>.md` and a `<now>.md.pending` sidecar.
/// The sidecar JSON keys are a cross-process contract with the orche CLI watcher.
/// Mirrors submitReview in submit.ts.
pub fn submit_review(
    worktree_path: &str,
    markdown: &str,
    target: &SubmitTarget,
    now: u64,
) -> std::io::Result<SubmitResult> {
    let wt = Path::new(worktree_path);
    let name = wt
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    // <wt>/../../reviews/<name> == <wt.parent().parent()>/reviews/<name>
    let reviews_dir: PathBuf = wt
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(wt)
        .join("reviews")
        .join(&name);
    std::fs::create_dir_all(&reviews_dir)?;

    let filename = format!("{now}.md");
    let review_path = reviews_dir.join(&filename);
    std::fs::write(&review_path, markdown)?;

    let pending_path = reviews_dir.join(format!("{filename}.pending"));
    let pending = PendingFile {
        review_path: review_path.to_string_lossy().into_owned(),
        multiplexer: target.multiplexer.clone(),
        pane_id: target.pane_id.clone(),
        workspace_id: target.workspace_id.clone(),
    };
    std::fs::write(&pending_path, serde_json::to_string(&pending).unwrap())?;

    Ok(SubmitResult {
        success: true,
        path: Some(review_path.to_string_lossy().into_owned()),
        error: None,
    })
}
