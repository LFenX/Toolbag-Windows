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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticToolManifest {
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
    pub last_run_at: Option<String>,
    pub run_count: u32,
    pub average_duration_ms: Option<u64>,
    pub last_result: LastResult,
}

impl ToolManifest {
    pub fn from_metadata(metadata: StaticToolManifest, summary: ToolRunSummary) -> Self {
        Self {
            id: metadata.id,
            name: metadata.name,
            description: metadata.description,
            category: metadata.category,
            version: metadata.version,
            route_path: metadata.route_path,
            tags: metadata.tags,
            risk_level: metadata.risk_level,
            requires_elevation: metadata.requires_elevation,
            permission_requirement: metadata.permission_requirement,
            data_access: metadata.data_access,
            detail_description: metadata.detail_description,
            last_run_at: summary.last_run_at,
            run_count: summary.run_count,
            average_duration_ms: summary.average_duration_ms,
            last_result: summary.last_result,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RiskLevel {
    Safe,
    Caution,
    Elevated,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LastResult {
    Success,
    Failed,
    Cancelled,
    Never,
}

impl LastResult {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Never => "never",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "success" => Some(Self::Success),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            "never" => Some(Self::Never),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolRunSummary {
    pub last_run_at: Option<String>,
    pub run_count: u32,
    pub average_duration_ms: Option<u64>,
    pub last_result: LastResult,
}

impl Default for ToolRunSummary {
    fn default() -> Self {
        Self {
            last_run_at: None,
            run_count: 0,
            average_duration_ms: None,
            last_result: LastResult::Never,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
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
