//! Built-in plugins shipped inside the app bundle. These plugins use the `builtin`
//! runtime kind and route to first-party Rust handlers + first-party React renderers.

use std::sync::atomic::Ordering;
use std::sync::Arc;

use serde_json::Value;
use tauri::{Emitter, Manager};

use crate::elevation;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::plugins::runner::{BuiltinCallContext, BuiltinHandler, Runner};

/// What a bundled plugin ships with.
pub struct BundledPlugin {
    pub id: &'static str,
    pub version: &'static str,
    pub tool_json: &'static str,
    pub ui_json: Option<&'static str>,
}

pub const BUNDLED_PLUGINS: &[BundledPlugin] = &[BundledPlugin {
    id: "com.lfen.toolbag.environment-overview",
    version: "1.0.0",
    tool_json: include_str!("../../resources/bundled-plugins/environment-overview/tool.json"),
    ui_json: Some(include_str!(
        "../../resources/bundled-plugins/environment-overview/ui.json"
    )),
}];

pub fn register_all(runner: &Arc<Runner>) {
    register_environment_overview(runner);
}

fn register_environment_overview(runner: &Arc<Runner>) {
    let handler: BuiltinHandler = Box::new(scan_environment);
    runner.register_builtin("environment-overview/start_scan", handler);
    let handler: BuiltinHandler = Box::new(snapshot_environment);
    runner.register_builtin("environment-overview/snapshot", handler);
    let handler: BuiltinHandler = Box::new(elevation_status);
    runner.register_builtin("environment-overview/elevation_status", handler);
}

fn scan_environment(ctx: BuiltinCallContext) -> AppResult<Value> {
    let app = ctx.app.clone();
    let state = app.state::<crate::state::AppState>();
    let data_dir = state.data_dir().to_path_buf();
    let log_dir = state.log_dir().to_path_buf();
    let is_admin = elevation::is_elevated();
    let job_id = ctx.job_id.clone();
    let cancel = ctx.cancel.clone();
    let app_for_scan = app.clone();
    let outcome = tauri::async_runtime::block_on(async move {
        crate::environment::scan::start_scan(
            app_for_scan,
            job_id,
            data_dir,
            log_dir,
            is_admin,
            cancel,
        )
        .await
    });
    if ctx.cancel.load(Ordering::Relaxed) {
        return Err(AppError::coded(ErrorCode::Cancelled, "已取消"));
    }
    Ok(serde_json::json!({
        "result": outcome.result.as_str(),
        "durationMs": outcome.duration_ms,
        "message": outcome.message,
    }))
}

fn snapshot_environment(ctx: BuiltinCallContext) -> AppResult<Value> {
    let app = ctx.app.clone();
    let state = app.state::<crate::state::AppState>();
    let snapshot =
        crate::environment::collect_environment_snapshot(state.data_dir(), state.log_dir());
    let _ = app.emit(
        "plugin://job-log",
        serde_json::json!({
            "jobId": ctx.job_id,
            "level": "info",
            "message": "snapshot collected",
        }),
    );
    Ok(serde_json::to_value(snapshot)?)
}

fn elevation_status(_ctx: BuiltinCallContext) -> AppResult<Value> {
    Ok(serde_json::json!({
        "elevated": elevation::is_elevated(),
    }))
}
