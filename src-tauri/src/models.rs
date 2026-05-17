use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub build_profile: String,
    pub data_dir: String,
    pub log_dir: String,
}

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
    pub last_run_at: String,
    pub run_count: u32,
    pub average_duration_ms: u32,
    pub last_result: LastResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum RiskLevel {
    Safe,
    Caution,
    Elevated,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum LastResult {
    Success,
    Failed,
    Never,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub favorite_tool_ids: Vec<String>,
    pub auto_check_updates: bool,
    pub launch_at_startup: bool,
    pub telemetry_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            favorite_tool_ids: vec!["environment-overview".to_string()],
            auto_check_updates: true,
            launch_at_startup: false,
            telemetry_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub current_version: String,
    pub update_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogExport {
    pub file_path: String,
    pub bytes: u64,
}
