//! Thin JSON-over-stdio adapter so the TypeScript contract suite can drive the
//! Rust backend exactly as it drives the electron one. Reads one JSON request
//! object on stdin, dispatches to orche_review_core, writes one JSON result on
//! stdout. Not a product surface — purely the parity harness.
//!
//! Request: { "method": "...", "worktreePath": "...", "base": "...", ... }

use orche_review_core as core;
use serde::Deserialize;
use std::io::Read;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    method: String,
    #[serde(default)]
    worktree_path: String,
    #[serde(default)]
    base: String,
    #[serde(default)]
    range: Option<core::Range>,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    explicit: Option<String>,
    #[serde(default)]
    tmux_target: Option<String>,
    #[serde(default)]
    cmux_surface: Option<String>,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default)]
    target: Option<core::SubmitTarget>,
    #[serde(default)]
    now: Option<u64>,
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("read stdin");
    let req: Request = serde_json::from_str(&input).expect("parse request json");

    let range = req.range.unwrap_or(core::Range::All);
    let out = match req.method.as_str() {
        "getChanges" => {
            serde_json::to_string(&core::get_changed_files(&req.worktree_path, &req.base, &range))
        }
        "getCommits" => serde_json::to_string(&core::get_commits(&req.worktree_path, &req.base)),
        "getBranch" => serde_json::to_string(&core::get_branch(&req.worktree_path)),
        "resolveBase" => {
            serde_json::to_string(&core::resolve_base(&req.worktree_path, req.explicit.as_deref()))
        }
        "resolveSubmitTarget" => serde_json::to_string(&core::resolve_submit_target(
            &req.worktree_path,
            req.tmux_target.as_deref(),
            req.cmux_surface.as_deref(),
        )),
        "readOriginal" => serde_json::to_string(&core::read_original(
            &req.worktree_path,
            &req.base,
            &range,
            &req.file_path.unwrap_or_default(),
        )),
        "readModified" => serde_json::to_string(&core::read_modified(
            &req.worktree_path,
            &req.base,
            &range,
            &req.file_path.unwrap_or_default(),
        )),
        "readOriginalBase64" => serde_json::to_string(&core::read_original_base64(
            &req.worktree_path,
            &req.base,
            &range,
            &req.file_path.unwrap_or_default(),
        )),
        "readModifiedBase64" => serde_json::to_string(&core::read_modified_base64(
            &req.worktree_path,
            &req.base,
            &range,
            &req.file_path.unwrap_or_default(),
        )),
        "submit" => {
            let target = req.target.expect("submit requires target");
            let result = core::submit_review(
                &req.worktree_path,
                &req.markdown.unwrap_or_default(),
                &target,
                req.now.expect("submit requires now"),
            )
            .expect("submit io");
            serde_json::to_string(&result)
        }
        other => panic!("unknown method: {other}"),
    };

    print!("{}", out.expect("serialize result"));
}
