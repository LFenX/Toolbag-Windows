use std::fs;

use tauri::{AppHandle, Emitter, Manager, State};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::elevation;
use crate::environment::EnvironmentSnapshot;
use crate::errors::AppResult;
use crate::models::{AppInfo, AppSettings, LogExport, ReleaseStatus, ToolManifest};
use crate::state::AppState;

const APP_NAME: &str = "Toolbag";
const APP_IDENTIFIER: &str = "com.lfen.toolbag";

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppResult<AppInfo> {
    Ok(AppInfo {
        name: APP_NAME.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        identifier: APP_IDENTIFIER.to_string(),
        build_profile: build_profile().to_string(),
        data_dir: state.data_dir().display().to_string(),
        log_dir: state.log_dir().display().to_string(),
    })
}

#[tauri::command]
pub fn list_tools(state: State<'_, AppState>) -> AppResult<Vec<ToolManifest>> {
    crate::tools::list_tools(state.database())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.database().get_settings()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> AppResult<AppSettings> {
    let mut sanitized = settings;
    sanitized.telemetry_enabled = false;
    state.database().save_settings(&sanitized)?;
    Ok(sanitized)
}

#[tauri::command]
pub fn get_release_status(_app: AppHandle) -> ReleaseStatus {
    crate::updates::current_status(env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn check_for_updates(_app: AppHandle) -> AppResult<ReleaseStatus> {
    crate::updates::check(env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn export_logs(state: State<'_, AppState>) -> AppResult<LogExport> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)?
        .replace(':', "-");
    let export_dir = state.data_dir().join("log-exports").join(timestamp);
    fs::create_dir_all(&export_dir)?;

    let mut bytes = 0_u64;
    if state.log_dir().exists() {
        for entry in fs::read_dir(state.log_dir())? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let target = export_dir.join(entry.file_name());
            bytes += fs::copy(path, target)?;
        }
    }

    let manifest = export_dir.join("README.txt");
    let manifest_body =
        "Toolbag local log export. Logs stay on this machine unless you share them.";
    fs::write(&manifest, manifest_body)?;
    bytes += manifest_body.len() as u64;

    Ok(LogExport {
        file_path: export_dir.display().to_string(),
        bytes,
    })
}

/// Legacy single-shot snapshot (kept for browser preview / tests).
#[tauri::command]
pub fn get_environment_snapshot(state: State<'_, AppState>) -> EnvironmentSnapshot {
    crate::environment::collect_environment_snapshot(state.data_dir(), state.log_dir())
}

// ── Streaming scan commands ───────────────────────────────────────────────────

/// Start a new parallel streaming environment scan.
/// Returns the job_id immediately; results arrive via env:// events.
#[tauri::command]
pub async fn start_environment_scan(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let job_id = Uuid::new_v4().to_string();
    let cancel = state.register_scan(job_id.clone());

    let data_dir = state.data_dir().to_path_buf();
    let log_dir = state.log_dir().to_path_buf();
    let is_admin = elevation::is_elevated();

    let app_for_scan = app.clone();
    let app_for_cleanup = app.clone();
    let job_id_c = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let outcome = crate::environment::scan::start_scan(
            app_for_scan,
            job_id_c.clone(),
            data_dir,
            log_dir,
            is_admin,
            cancel,
        )
        .await;

        let managed_state = app_for_cleanup.state::<AppState>();
        if let Err(error) = managed_state.database().record_tool_run(
            "environment-overview",
            outcome.result,
            Some(outcome.duration_ms),
            outcome.message.as_deref(),
        ) {
            log::warn!("failed to record environment scan run: {error}");
        }
        match outcome.result {
            crate::models::LastResult::Cancelled => {
                let _ = app_for_cleanup.emit(
                    "env://job-cancelled",
                    serde_json::json!({ "jobId": &job_id_c }),
                );
            }
            _ => {
                let _ = app_for_cleanup.emit(
                    "env://job-done",
                    serde_json::json!({
                        "jobId": &job_id_c,
                        "durationMs": outcome.duration_ms,
                    }),
                );
            }
        }
        managed_state.remove_scan(&job_id_c);
    });

    Ok(job_id)
}

/// Cancel a running scan by job_id.
#[tauri::command]
pub fn cancel_environment_scan(job_id: String, state: State<'_, AppState>) -> bool {
    state.cancel_scan(&job_id)
}

// ── Elevation commands ────────────────────────────────────────────────────────

/// Returns whether the current process is running with administrator privileges.
#[tauri::command]
pub fn get_is_elevated() -> bool {
    elevation::is_elevated()
}

/// Relaunch the app with UAC elevation. The current process should exit after calling this.
#[tauri::command]
pub fn relaunch_as_admin() -> AppResult<bool> {
    elevation::relaunch_as_admin().map_err(|e| crate::errors::AppError::Message(e.to_string()))
}

fn build_profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    }
}
