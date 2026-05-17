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
    pub plugins_dir: String,
    pub trusted_pubkey_fingerprint: Option<String>,
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

/// Categorical key for the sidebar; localized labels live in the registry.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppSettings {
    pub favorite_tool_ids: Vec<String>,
    pub app_auto_update: bool,
    pub plugin_auto_update: bool,
    pub update_check_frequency: UpdateFrequency,
    pub update_channel: UpdateChannel,
    pub launch_at_startup: bool,
    pub telemetry_enabled: bool,
    pub theme: ThemePref,
    pub accent: AccentColor,
    pub density: Density,
    pub motion: MotionPref,
    pub language: String,
    pub startup_page: StartupPage,
    pub recent_list_size: u8,
    pub log_retention_days: LogRetention,
    pub registry_url: Option<String>,
    pub allow_unsigned: bool,
    pub max_concurrent_downloads: u8,
    pub http_proxy: Option<String>,
    pub font_scale: u8,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            favorite_tool_ids: vec!["com.lfen.toolbag.environment-overview".to_string()],
            app_auto_update: true,
            plugin_auto_update: true,
            update_check_frequency: UpdateFrequency::OnStart,
            update_channel: UpdateChannel::Stable,
            launch_at_startup: false,
            telemetry_enabled: false,
            theme: ThemePref::System,
            accent: AccentColor::Indigo,
            density: Density::Comfortable,
            motion: MotionPref::System,
            language: "zh-CN".to_string(),
            startup_page: StartupPage::Workbench,
            recent_list_size: 10,
            log_retention_days: LogRetention::Days { value: 30 },
            registry_url: None,
            allow_unsigned: false,
            max_concurrent_downloads: 2,
            http_proxy: None,
            font_scale: 100,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateFrequency {
    OnStart,
    Daily,
    Weekly,
    Manual,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateChannel {
    Stable,
    Beta,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemePref {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AccentColor {
    Indigo,
    Emerald,
    Rose,
    Amber,
    Custom(String),
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Density {
    Compact,
    Comfortable,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionPref {
    On,
    Off,
    System,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StartupPage {
    Workbench,
    LastTool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogRetention {
    Days { value: u16 },
    Forever,
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
