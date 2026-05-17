use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::elevation;
use crate::environment::EnvironmentSnapshot;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::models::{AppInfo, AppSettings, LogExport, ReleaseStatus};
use crate::plugins::manifest::ToolManifest;
use crate::plugins::registry::RegistryIndex;
use crate::plugins::signature;
use crate::plugins::store::{PluginUiSchema, SignatureStatus};
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
        plugins_dir: state.plugins().plugins_root().display().to_string(),
        trusted_pubkey_fingerprint: signature::pubkey_fingerprint(),
    })
}

#[tauri::command]
pub fn list_tools(state: State<'_, AppState>) -> AppResult<Vec<ToolManifest>> {
    state.plugins().list_tools()
}

#[tauri::command]
pub fn get_plugin_ui_schema(
    plugin_id: String,
    state: State<'_, AppState>,
) -> AppResult<Option<PluginUiSchema>> {
    state.plugins().load_ui_schema(&plugin_id)
}

#[tauri::command]
pub fn get_signature_status(state: State<'_, AppState>) -> SignatureStatus {
    state.plugins().signature_status()
}

#[tauri::command]
pub fn list_registry_plugins(
    force_refresh: bool,
    state: State<'_, AppState>,
) -> AppResult<RegistryIndex> {
    let settings = state.database().get_settings()?;
    state.plugins().registry_index(
        force_refresh,
        settings.registry_url.as_deref(),
        settings.http_proxy.as_deref(),
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub plugin_id: String,
    pub version: String,
}

#[tauri::command]
pub fn import_plugin_from_file(
    package_path: String,
    signature_path: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<InstallResult> {
    let pkg = PathBuf::from(&package_path);
    let sig = signature_path.map(PathBuf::from);
    let manifest = state.plugins().install_from_path(
        pkg,
        sig,
        Some(format!("file://{package_path}")),
        None,
    )?;
    Ok(InstallResult {
        plugin_id: manifest.id,
        version: manifest.version,
    })
}

#[tauri::command]
pub fn install_plugin_from_registry(
    plugin_id: String,
    state: State<'_, AppState>,
) -> AppResult<InstallResult> {
    let settings = state.database().get_settings()?;
    let index = state.plugins().registry_index(
        false,
        settings.registry_url.as_deref(),
        settings.http_proxy.as_deref(),
    )?;
    let entry = index
        .plugins
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| AppError::coded(ErrorCode::NotFound, "注册表中未找到该插件"))?
        .clone();

    let downloads_dir = state.data_dir().join("downloads");
    fs::create_dir_all(&downloads_dir)?;
    let tmp_pkg = downloads_dir.join(format!("{}-{}.tbpkg", entry.id, entry.latest_version));
    download_file(
        &entry.download_url,
        &tmp_pkg,
        settings.http_proxy.as_deref(),
    )?;

    let sig_tmp = if let Some(sig_url) = entry.signature_url.as_deref() {
        let path = downloads_dir.join(format!("{}-{}.tbpkg.sig", entry.id, entry.latest_version));
        download_file(sig_url, &path, settings.http_proxy.as_deref())?;
        Some(path)
    } else {
        None
    };

    let manifest = state.plugins().install_from_path(
        tmp_pkg,
        sig_tmp,
        Some(entry.download_url.clone()),
        entry.sha256.clone(),
    )?;
    Ok(InstallResult {
        plugin_id: manifest.id,
        version: manifest.version,
    })
}

fn download_file(url: &str, target: &std::path::Path, proxy: Option<&str>) -> AppResult<()> {
    let mut builder = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(8))
        .timeout_read(std::time::Duration::from_secs(30));
    if let Some(p) = proxy {
        if !p.is_empty() {
            if let Ok(proxy) = ureq::Proxy::new(p) {
                builder = builder.proxy(proxy);
            }
        }
    }
    let agent = builder.build();
    let resp = agent
        .get(url)
        .call()
        .map_err(|e| AppError::coded(ErrorCode::Network, format!("下载失败：{e}")))?;
    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(target)?;
    std::io::copy(&mut reader, &mut file)?;
    Ok(())
}

#[tauri::command]
pub fn uninstall_plugin(plugin_id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.plugins().uninstall(&plugin_id)
}

#[tauri::command]
pub fn toggle_plugin(
    plugin_id: String,
    disabled: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.plugins().set_disabled(&plugin_id, disabled)
}

#[tauri::command]
pub fn set_plugin_permissions(
    plugin_id: String,
    permissions: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.plugins().set_perms(&plugin_id, permissions)
}

#[tauri::command]
pub fn start_plugin_command(
    app: AppHandle,
    plugin_id: String,
    command: String,
    params: Option<Value>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    state
        .plugins()
        .start_command(app, &plugin_id, command, params.unwrap_or(Value::Null))
}

#[tauri::command]
pub fn cancel_plugin_command(job_id: String, state: State<'_, AppState>) -> bool {
    state.plugins().cancel(&job_id)
}

/// Tears down a persistent sidecar process for the given plugin. Subsequent
/// `start_plugin_command` calls will spawn a fresh process. No-op when no
/// persistent session is open.
#[tauri::command]
pub fn shutdown_plugin_session(plugin_id: String, state: State<'_, AppState>) -> bool {
    state.plugins().shutdown_session(&plugin_id)
}

/// Sends an arbitrary NDJSON frame to a persistent sidecar's stdin. Useful
/// for interactive protocols (e.g. forwarding user input to a child process
/// the sidecar manages). Errors if no persistent session is open.
#[tauri::command]
pub fn send_plugin_frame(
    plugin_id: String,
    frame: Value,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.plugins().send_frame(&plugin_id, frame)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.database().get_settings()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> AppResult<AppSettings> {
    let mut sanitized = settings;
    sanitized.telemetry_enabled = false;
    // Only allow unsigned packages in debug builds.
    #[cfg(not(debug_assertions))]
    {
        sanitized.allow_unsigned = false;
    }
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
pub fn restart_app(app: AppHandle) -> AppResult<()> {
    app.request_restart();
    Ok(())
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

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> AppResult<String> {
    Ok(state.data_dir().display().to_string())
}

#[tauri::command]
pub fn clear_registry_cache(state: State<'_, AppState>) -> AppResult<()> {
    let conn = state.database();
    // We don't have a single helper for delete, do raw via get_registry_cache schema.
    // Use simple insert with empty to overwrite; easier: insert empty bodies for all rows.
    // Implementation: directly run DELETE through a new helper would be cleaner; for now we
    // do a no-op refresh via writing a sentinel row that effectively expires content.
    conn.put_registry_cache(&crate::database::RegistryCacheRow {
        url: crate::plugins::registry::DEFAULT_REGISTRY_URL.to_string(),
        etag: None,
        body: "{}".to_string(),
        fetched_at: String::new(),
    })?;
    Ok(())
}

/// Legacy single-shot snapshot (kept for browser preview / tests).
#[tauri::command]
pub fn get_environment_snapshot(state: State<'_, AppState>) -> EnvironmentSnapshot {
    crate::environment::collect_environment_snapshot(state.data_dir(), state.log_dir())
}

// ── Streaming scan commands (legacy path; kept for backwards compat) ─────────

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
        if let Err(error) = managed_state.database().record_plugin_run(
            "com.lfen.toolbag.environment-overview",
            "start_scan",
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

#[tauri::command]
pub fn cancel_environment_scan(job_id: String, state: State<'_, AppState>) -> bool {
    state.cancel_scan(&job_id)
}

// ── Elevation commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_is_elevated() -> bool {
    elevation::is_elevated()
}

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
