use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult, ErrorCode};
use crate::models::{LastResult, RiskLevel, ToolRunSummary};

/// The raw shape of `tool.json`. Hand-edited by plugin authors.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub id: String,
    pub name: String,
    pub version: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub description: String,
    #[serde(default)]
    pub detail_description: String,
    #[serde(default)]
    pub author: Option<PluginAuthor>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub max_app_version: Option<String>,
    pub risk_level: RiskLevel,
    #[serde(default)]
    pub requires_elevation: bool,
    #[serde(default)]
    pub permission_requirement: String,
    #[serde(default)]
    pub data_access: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub runtime: PluginRuntime,
    #[serde(default)]
    pub commands: Vec<CommandSpec>,
    #[serde(default)]
    pub ui: Option<String>,
    /// Identifier the frontend uses to pick a hard-coded React renderer when
    /// `runtime.kind == "builtin"`. Ignored otherwise.
    #[serde(default)]
    pub builtin_renderer: Option<String>,
    /// True when this manifest is shipped inside the app bundle.
    #[serde(default)]
    pub bundled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginAuthor {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeKind {
    None,
    Builtin,
    Sidecar,
}

/// How long the sidecar process should live.
///
/// - `Ephemeral` (default): spawn → one request → result → exit. Cheap and
///   simple; appropriate for stateless utilities (hash, encode, lookup).
/// - `Persistent`: spawn once and keep running across requests. The same
///   sidecar receives many NDJSON request frames over its stdin and answers
///   each by `id`. Use this for tools that hold expensive state (open
///   sessions, db connections, child processes, caches).
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SidecarLifecycle {
    #[default]
    Ephemeral,
    Persistent,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntime {
    pub kind: RuntimeKind,
    #[serde(default)]
    pub binary: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default = "default_startup_timeout")]
    pub startup_timeout_ms: u64,
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_ms: u64,
    #[serde(default)]
    pub lifecycle: SidecarLifecycle,
}

fn default_startup_timeout() -> u64 {
    3000
}

fn default_shutdown_timeout() -> u64 {
    1500
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
}

/// Decorated tool record returned to the frontend (manifest + runtime summary).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub version: String,
    pub route_path: String,
    pub tags: Vec<String>,
    pub risk_level: RiskLevel,
    pub requires_elevation: bool,
    pub permission_requirement: String,
    pub data_access: String,
    pub detail_description: String,
    pub runtime_kind: RuntimeKind,
    pub builtin_renderer: Option<String>,
    pub bundled: bool,
    pub installed: bool,
    pub disabled: bool,
    pub granted_perms: Vec<String>,
    pub min_app_version: Option<String>,
    pub last_run_at: Option<String>,
    pub run_count: u32,
    pub average_duration_ms: Option<u64>,
    pub last_result: LastResult,
    pub icon: Option<String>,
    pub ui_schema_path: Option<String>,
    pub permissions_required: Vec<String>,
}

impl ToolManifest {
    pub fn from_parts(
        manifest: &PluginManifest,
        summary: ToolRunSummary,
        installed: bool,
        disabled: bool,
        granted: Vec<String>,
        bundled: bool,
        ui_schema_path: Option<String>,
    ) -> Self {
        let mut required: HashSet<String> = HashSet::new();
        for cmd in &manifest.commands {
            for p in &cmd.permissions {
                required.insert(p.clone());
            }
        }
        Self {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            description: manifest.description.clone(),
            category: manifest.category.clone(),
            version: manifest.version.clone(),
            route_path: format!("/tools/{}", manifest.id),
            tags: manifest.tags.clone(),
            risk_level: manifest.risk_level.clone(),
            requires_elevation: manifest.requires_elevation,
            permission_requirement: manifest.permission_requirement.clone(),
            data_access: manifest.data_access.clone(),
            detail_description: if manifest.detail_description.is_empty() {
                manifest.description.clone()
            } else {
                manifest.detail_description.clone()
            },
            runtime_kind: manifest.runtime.kind,
            builtin_renderer: manifest.builtin_renderer.clone(),
            bundled,
            installed,
            disabled,
            granted_perms: granted,
            min_app_version: manifest.min_app_version.clone(),
            last_run_at: summary.last_run_at,
            run_count: summary.run_count,
            average_duration_ms: summary.average_duration_ms,
            last_result: summary.last_result,
            icon: manifest.icon.clone(),
            ui_schema_path,
            permissions_required: required.into_iter().collect(),
        }
    }
}

pub fn parse_manifest(text: &str) -> AppResult<PluginManifest> {
    let manifest: PluginManifest = serde_json::from_str(text)
        .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("解析 tool.json 失败：{e}")))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

pub fn validate_manifest(manifest: &PluginManifest) -> AppResult<()> {
    if manifest.id.trim().is_empty() {
        return Err(AppError::coded(ErrorCode::Manifest, "plugin id 不能为空"));
    }
    if !is_valid_id(&manifest.id) {
        return Err(AppError::coded(
            ErrorCode::Manifest,
            format!("plugin id 必须是反域名格式：{}", manifest.id),
        ));
    }
    if manifest.version.trim().is_empty() {
        return Err(AppError::coded(
            ErrorCode::Manifest,
            "plugin version 不能为空",
        ));
    }
    semver::Version::parse(&manifest.version).map_err(|e| {
        AppError::coded(
            ErrorCode::Manifest,
            format!("plugin version 不是合法 semver: {e}"),
        )
    })?;
    if let Some(min) = &manifest.min_app_version {
        semver::VersionReq::parse(&format!(">= {min}")).map_err(|e| {
            AppError::coded(ErrorCode::Manifest, format!("minAppVersion 无法解析: {e}"))
        })?;
    }
    match manifest.runtime.kind {
        RuntimeKind::Sidecar => {
            if manifest.runtime.binary.is_none() {
                return Err(AppError::coded(
                    ErrorCode::Manifest,
                    "sidecar runtime 必须声明 binary",
                ));
            }
        }
        RuntimeKind::Builtin => {
            if manifest.builtin_renderer.is_none() {
                return Err(AppError::coded(
                    ErrorCode::Manifest,
                    "builtin runtime 必须声明 builtinRenderer",
                ));
            }
        }
        RuntimeKind::None => {}
    }
    Ok(())
}

fn is_valid_id(value: &str) -> bool {
    let mut segments = 0;
    for segment in value.split('.') {
        segments += 1;
        if segment.is_empty() {
            return false;
        }
        let first = segment.chars().next().unwrap();
        if !first.is_ascii_lowercase() {
            return false;
        }
        for c in segment.chars() {
            if !(c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
                return false;
            }
        }
    }
    segments >= 2
}

pub fn satisfies_app_version(manifest: &PluginManifest, app_version: &str) -> AppResult<bool> {
    let Some(min) = &manifest.min_app_version else {
        return Ok(true);
    };
    let req = semver::VersionReq::parse(&format!(">= {min}"))
        .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("minAppVersion 无效: {e}")))?;
    let current = semver::Version::parse(app_version)
        .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("当前 app 版本无效: {e}")))?;
    Ok(req.matches(&current))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_manifest() -> &'static str {
        r#"{
  "id": "com.lfen.toolbag.example",
  "name": "示例",
  "version": "1.0.0",
  "category": "实用",
  "description": "demo",
  "riskLevel": "safe",
  "runtime": { "kind": "none" }
}"#
    }

    #[test]
    fn parses_minimal_manifest() {
        let m = parse_manifest(sample_manifest()).expect("manifest");
        assert_eq!(m.id, "com.lfen.toolbag.example");
        assert_eq!(m.runtime.kind, RuntimeKind::None);
    }

    #[test]
    fn rejects_bad_id() {
        let text = sample_manifest().replace("com.lfen.toolbag.example", "BadID");
        let err = parse_manifest(&text).expect_err("expected manifest error");
        assert_eq!(err.code(), ErrorCode::Manifest);
    }

    #[test]
    fn rejects_sidecar_without_binary() {
        let text = sample_manifest().replace("\"kind\": \"none\"", "\"kind\": \"sidecar\"");
        let err = parse_manifest(&text).expect_err("expected manifest error");
        assert_eq!(err.code(), ErrorCode::Manifest);
    }

    #[test]
    fn parses_min_app_version() {
        let text = sample_manifest().replace(
            "\"runtime\": { \"kind\": \"none\" }",
            "\"minAppVersion\": \"0.2.0\", \"runtime\": { \"kind\": \"none\" }",
        );
        let m = parse_manifest(&text).expect("manifest");
        assert!(satisfies_app_version(&m, "0.3.0").expect("check"));
        assert!(!satisfies_app_version(&m, "0.1.0").expect("check"));
    }
}
