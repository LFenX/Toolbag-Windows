use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::database::Database;
use crate::errors::AppResult;
use crate::plugins::PluginStore;

pub struct AppState {
    database: Arc<Database>,
    data_dir: PathBuf,
    log_dir: PathBuf,
    /// Active scan jobs keyed by job_id. Set the AtomicBool to true to cancel.
    scans: Mutex<HashMap<String, Arc<AtomicBool>>>,
    plugins: PluginStore,
}

impl AppState {
    pub fn initialize(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app.path().app_data_dir()?;
        let log_dir = app.path().app_log_dir()?;

        fs::create_dir_all(&data_dir)?;
        fs::create_dir_all(&log_dir)?;

        let database = Arc::new(Database::open(&data_dir.join("toolbag.sqlite3"))?);

        let plugins_root = data_dir.join("plugins");
        let staging_root = data_dir.join("staging");
        let plugins = PluginStore::initialize(plugins_root, staging_root, Arc::clone(&database))?;

        Ok(Self {
            database,
            data_dir,
            log_dir,
            scans: Mutex::new(HashMap::new()),
            plugins,
        })
    }

    pub fn database(&self) -> &Database {
        &self.database
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }

    pub fn plugins(&self) -> &PluginStore {
        &self.plugins
    }

    /// Register a new scan job and return its cancellation flag.
    pub fn register_scan(&self, job_id: String) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.scans.lock() {
            map.insert(job_id, flag.clone());
        }
        flag
    }

    /// Cancel a scan by setting its flag. Returns true if the job was found.
    pub fn cancel_scan(&self, job_id: &str) -> bool {
        use std::sync::atomic::Ordering;
        if let Ok(map) = self.scans.lock() {
            if let Some(flag) = map.get(job_id) {
                flag.store(true, Ordering::Relaxed);
                return true;
            }
        }
        false
    }

    /// Remove a completed scan job from the registry.
    pub fn remove_scan(&self, job_id: &str) {
        if let Ok(mut map) = self.scans.lock() {
            map.remove(job_id);
        }
    }
}
