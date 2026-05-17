//! Plugin store: top-level coordination of installer, registry, runner, and DB.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::database::{Database, InstalledPluginRow};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::plugins::builtin;
use crate::plugins::installer::{InstallSource, Installer};
use crate::plugins::manifest::{parse_manifest, PluginManifest, ToolManifest};
use crate::plugins::registry::{Registry, RegistryIndex, DEFAULT_REGISTRY_URL};
use crate::plugins::runner::Runner;
use crate::plugins::signature;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct PluginStore {
    plugins_root: PathBuf,
    staging_root: PathBuf,
    database: Arc<Database>,
    runner: Arc<Runner>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiSchema {
    pub plugin_id: String,
    pub version: String,
    pub schema: Value,
    pub bundled: bool,
}

impl PluginStore {
    pub fn initialize(
        plugins_root: PathBuf,
        staging_root: PathBuf,
        database: Arc<Database>,
    ) -> AppResult<Self> {
        std::fs::create_dir_all(&plugins_root)?;
        std::fs::create_dir_all(&staging_root)?;
        let store = Self {
            plugins_root,
            staging_root,
            database,
            runner: Arc::new(Runner::new()),
        };
        builtin::register_all(&store.runner);
        store.seed_bundled()?;
        Ok(store)
    }

    #[allow(dead_code)]
    pub fn database(&self) -> &Database {
        &self.database
    }

    #[allow(dead_code)]
    pub fn runner(&self) -> Arc<Runner> {
        Arc::clone(&self.runner)
    }

    pub fn plugins_root(&self) -> &Path {
        &self.plugins_root
    }

    /// Lay out the bundled plugins inside the app data directory if missing.
    /// Bundled plugin manifests live under `src-tauri/resources/bundled-plugins/<id>/`.
    pub fn seed_bundled(&self) -> AppResult<()> {
        for spec in builtin::BUNDLED_PLUGINS {
            let install_dir = self.plugins_root.join(spec.id).join(spec.version);
            if !install_dir.exists() {
                std::fs::create_dir_all(&install_dir)?;
                std::fs::write(install_dir.join("tool.json"), spec.tool_json)?;
                if let Some(ui_json) = spec.ui_json {
                    std::fs::write(install_dir.join("ui.json"), ui_json)?;
                }
            }
            let current = self.plugins_root.join(spec.id).join("current.txt");
            std::fs::write(&current, spec.version.as_bytes())?;
            let row = InstalledPluginRow {
                id: spec.id.to_string(),
                current_version: spec.version.to_string(),
                installed_at: String::new(),
                updated_at: String::new(),
                source: "bundled".to_string(),
                source_url: "bundled://app".to_string(),
                bundled: true,
                disabled: false,
                granted_perms: vec![],
            };
            self.database.upsert_installed_plugin(&row)?;
        }
        Ok(())
    }

    pub fn list_tools(&self) -> AppResult<Vec<ToolManifest>> {
        let installed = self.database.list_installed_plugins()?;
        let mut by_id: HashMap<String, InstalledPluginRow> = HashMap::new();
        for row in installed {
            by_id.insert(row.id.clone(), row);
        }

        let mut tools = Vec::new();
        for (id, row) in &by_id {
            let manifest_path = self
                .plugins_root
                .join(id)
                .join(&row.current_version)
                .join("tool.json");
            if !manifest_path.exists() {
                log::warn!("plugin manifest missing: {}", manifest_path.display());
                continue;
            }
            let manifest_text = std::fs::read_to_string(&manifest_path)?;
            let manifest = match parse_manifest(&manifest_text) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!("plugin {id} manifest invalid: {e}");
                    continue;
                }
            };
            let summary = self.database.plugin_run_summary(id).unwrap_or_default();
            let ui_path = self
                .plugins_root
                .join(id)
                .join(&row.current_version)
                .join("ui.json");
            let ui_path_str = if ui_path.exists() {
                Some(ui_path.display().to_string())
            } else {
                None
            };
            tools.push(ToolManifest::from_parts(
                &manifest,
                summary,
                true,
                row.disabled,
                row.granted_perms.clone(),
                row.bundled,
                ui_path_str,
            ));
        }
        tools.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(tools)
    }

    pub fn load_manifest(&self, id: &str) -> AppResult<(PluginManifest, PathBuf)> {
        let row = self
            .database
            .get_installed_plugin(id)?
            .ok_or_else(|| AppError::coded(ErrorCode::NotFound, format!("插件 {id} 未安装")))?;
        let dir = self.plugins_root.join(id).join(&row.current_version);
        let manifest_text = std::fs::read_to_string(dir.join("tool.json"))?;
        let manifest = parse_manifest(&manifest_text)?;
        Ok((manifest, dir))
    }

    pub fn load_ui_schema(&self, id: &str) -> AppResult<Option<PluginUiSchema>> {
        let row = self.database.get_installed_plugin(id)?;
        let Some(row) = row else {
            return Ok(None);
        };
        let dir = self.plugins_root.join(id).join(&row.current_version);
        let path = dir.join("ui.json");
        if !path.exists() {
            return Ok(None);
        }
        let text = std::fs::read_to_string(&path)?;
        let schema: Value = serde_json::from_str(&text)
            .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("ui.json 无效：{e}")))?;
        Ok(Some(PluginUiSchema {
            plugin_id: id.to_string(),
            version: row.current_version,
            schema,
            bundled: row.bundled,
        }))
    }

    pub fn registry_index(
        &self,
        force_refresh: bool,
        registry_url_override: Option<&str>,
        proxy: Option<&str>,
    ) -> AppResult<RegistryIndex> {
        let url = registry_url_override
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| DEFAULT_REGISTRY_URL.to_string());
        let registry = Registry {
            database: &self.database,
            url,
            proxy: proxy.map(|s| s.to_string()),
        };
        registry.fetch(force_refresh)
    }

    pub fn install_from_path(
        &self,
        package_path: PathBuf,
        signature_path: Option<PathBuf>,
        source_url: Option<String>,
        expected_sha256: Option<String>,
    ) -> AppResult<PluginManifest> {
        let installer = Installer {
            plugins_root: &self.plugins_root,
            staging_root: &self.staging_root,
            app_version: APP_VERSION,
            database: &self.database,
        };
        installer.install(InstallSource {
            package_path,
            signature_path,
            source_url: source_url.unwrap_or_else(|| "local".into()),
            expected_sha256,
        })
    }

    pub fn uninstall(&self, id: &str) -> AppResult<()> {
        let installer = Installer {
            plugins_root: &self.plugins_root,
            staging_root: &self.staging_root,
            app_version: APP_VERSION,
            database: &self.database,
        };
        installer.uninstall(id)
    }

    pub fn set_disabled(&self, id: &str, disabled: bool) -> AppResult<()> {
        let row = self
            .database
            .get_installed_plugin(id)?
            .ok_or_else(|| AppError::coded(ErrorCode::NotFound, format!("插件 {id} 未安装")))?;
        if row.bundled && disabled {
            return Err(AppError::coded(ErrorCode::Perm, "内置插件不允许禁用"));
        }
        self.database.set_plugin_disabled(id, disabled)
    }

    pub fn set_perms(&self, id: &str, perms: Vec<String>) -> AppResult<()> {
        let cleaned = crate::plugins::perms::validate_set(&perms);
        self.database.set_plugin_perms(id, &cleaned)
    }

    pub fn start_command(
        &self,
        app: AppHandle,
        plugin_id: &str,
        command: String,
        params: Value,
    ) -> AppResult<String> {
        let (manifest, dir) = self.load_manifest(plugin_id)?;
        let row = self
            .database
            .get_installed_plugin(plugin_id)?
            .ok_or_else(|| AppError::coded(ErrorCode::NotFound, "插件未安装"))?;
        if row.disabled {
            return Err(AppError::coded(ErrorCode::Perm, "插件已禁用"));
        }
        // For commands that declare permissions, ensure granted_perms cover them.
        let granted: std::collections::HashSet<&String> = row.granted_perms.iter().collect();
        if let Some(spec) = manifest.commands.iter().find(|c| c.id == command) {
            for required in &spec.permissions {
                if !granted.contains(required) {
                    return Err(AppError::coded(
                        ErrorCode::Perm,
                        format!("缺少权限 {required}，请先授权"),
                    ));
                }
            }
        }
        self.runner.start(
            app,
            Arc::clone(&self.database),
            manifest,
            dir,
            command,
            params,
        )
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        self.runner.cancel(job_id)
    }

    /// Best-effort shutdown of a persistent sidecar. Returns true if a
    /// session existed and was torn down; false when no session is open.
    pub fn shutdown_session(&self, plugin_id: &str) -> bool {
        self.runner.shutdown_session(plugin_id)
    }

    /// Push an arbitrary NDJSON frame into a persistent sidecar's stdin.
    pub fn send_frame(&self, plugin_id: &str, frame: Value) -> AppResult<()> {
        self.runner.send_frame(plugin_id, frame)
    }

    pub fn signature_status(&self) -> SignatureStatus {
        SignatureStatus {
            enforced: signature::is_enforced(),
            fingerprint: signature::pubkey_fingerprint(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureStatus {
    pub enforced: bool,
    pub fingerprint: Option<String>,
}
