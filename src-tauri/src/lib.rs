mod commands;
mod database;
mod elevation;
mod environment;
mod errors;
mod models;
mod state;
mod tools;
mod updates;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(optional_updater_plugin())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("toolbag".to_string()),
                }))
                .build(),
        )
        .setup(|app| {
            let state = AppState::initialize(app.handle())?;
            app.manage(state);
            log::info!("Toolbag initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::list_tools,
            commands::get_settings,
            commands::save_settings,
            commands::get_release_status,
            commands::check_for_updates,
            commands::export_logs,
            commands::get_environment_snapshot,
            // Streaming scan
            commands::start_environment_scan,
            commands::cancel_environment_scan,
            // Elevation
            commands::get_is_elevated,
            commands::relaunch_as_admin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toolbag");
}

#[cfg(feature = "updater")]
fn optional_updater_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_updater::Builder::new().build()
}

#[cfg(not(feature = "updater"))]
fn optional_updater_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("toolbag-updater-disabled").build()
}
