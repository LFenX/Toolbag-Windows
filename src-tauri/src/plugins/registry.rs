//! Plugin registry client.
//!
//! Reads `index.json` from a remote URL (with ETag caching), falling back to a small
//! bundled list shipped inside the app binary for first-run / offline scenarios.

use std::time::Duration;

use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::database::{Database, RegistryCacheRow};
use crate::errors::{AppError, AppResult, ErrorCode};

pub const DEFAULT_REGISTRY_URL: &str = "https://lfenx.github.io/Toolbag-Registry/index.json";
pub const FALLBACK_REGISTRY_URL: &str = "https://lfenx.github.io/Toolbag-Registry/index.json";

/// Hard-coded fallback so the marketplace is never empty even with no network.
const BUNDLED_INDEX: &str = include_str!("../../resources/registry-bundled.json");

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryIndex {
    pub schema_version: u32,
    pub generated_at: String,
    #[serde(default)]
    pub app_version: AppVersionInfo,
    #[serde(default)]
    pub categories: Vec<CategoryInfo>,
    pub plugins: Vec<RegistryEntry>,
    /// Where this index came from at runtime.
    #[serde(default)]
    pub source: IndexSource,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IndexSource {
    #[default]
    Bundled,
    Cached,
    Live,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    #[serde(default)]
    pub stable: Option<String>,
    #[serde(default)]
    pub beta: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub latest_version: String,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub risk_level: Option<String>,
    pub download_url: String,
    #[serde(default)]
    pub signature_url: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    pub published_at: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub changelog: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_author")]
    pub author: Option<String>,
}

fn deserialize_optional_author<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(author)) => Ok(non_empty(author)),
        Some(Value::Object(author)) => {
            let name = author
                .get("name")
                .and_then(Value::as_str)
                .or_else(|| author.get("url").and_then(Value::as_str))
                .map(ToOwned::to_owned);
            Ok(name.and_then(non_empty))
        }
        Some(other) => Err(de::Error::custom(format!(
            "expected author string or object, got {other}"
        ))),
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

pub struct Registry<'a> {
    pub database: &'a Database,
    pub url: String,
    pub proxy: Option<String>,
}

impl<'a> Registry<'a> {
    pub fn fetch(&self, force_refresh: bool) -> AppResult<RegistryIndex> {
        if !force_refresh {
            if let Some(cached) = self.database.get_registry_cache(&self.url)? {
                if let Ok(mut idx) = serde_json::from_str::<RegistryIndex>(&cached.body) {
                    idx.source = IndexSource::Cached;
                    return Ok(idx);
                }
            }
        }
        match self.fetch_from_network() {
            Ok(idx) => Ok(idx),
            Err(err) => {
                log::warn!("registry fetch failed: {err}");
                // Try fallback url then bundled.
                if self.url != FALLBACK_REGISTRY_URL {
                    let fb = Registry {
                        database: self.database,
                        url: FALLBACK_REGISTRY_URL.to_string(),
                        proxy: self.proxy.clone(),
                    };
                    if let Ok(idx) = fb.fetch_from_network() {
                        return Ok(idx);
                    }
                }
                bundled_index()
            }
        }
    }

    fn fetch_from_network(&self) -> AppResult<RegistryIndex> {
        let mut agent_builder = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(5))
            .timeout_read(Duration::from_secs(8));
        if let Some(proxy_url) = self.proxy.as_deref() {
            if !proxy_url.is_empty() {
                if let Ok(proxy) = ureq::Proxy::new(proxy_url) {
                    agent_builder = agent_builder.proxy(proxy);
                }
            }
        }
        let agent = agent_builder.build();

        let mut request = agent.get(&self.url);
        let cached = self.database.get_registry_cache(&self.url)?;
        if let Some(c) = cached.as_ref() {
            if let Some(etag) = c.etag.as_deref() {
                request = request.set("If-None-Match", etag);
            }
        }

        let response = request
            .call()
            .map_err(|e| AppError::coded(ErrorCode::Network, format!("拉取注册中心失败：{e}")))?;
        if response.status() == 304 {
            if let Some(c) = cached {
                let mut idx: RegistryIndex = serde_json::from_str(&c.body).map_err(|e| {
                    AppError::coded(ErrorCode::Manifest, format!("缓存索引解析失败：{e}"))
                })?;
                idx.source = IndexSource::Cached;
                return Ok(idx);
            }
        }
        let etag = response.header("ETag").map(|s| s.to_string());
        let body = response.into_string().map_err(|e| {
            AppError::coded(ErrorCode::Network, format!("读取注册中心 body 失败：{e}"))
        })?;
        let mut idx: RegistryIndex = serde_json::from_str(&body).map_err(|e| {
            AppError::coded(ErrorCode::Manifest, format!("注册中心 JSON 解析失败：{e}"))
        })?;
        idx.source = IndexSource::Live;
        let row = RegistryCacheRow {
            url: self.url.clone(),
            etag,
            body,
            fetched_at: String::new(),
        };
        self.database.put_registry_cache(&row)?;
        Ok(idx)
    }
}

pub fn bundled_index() -> AppResult<RegistryIndex> {
    let mut idx: RegistryIndex = serde_json::from_str(BUNDLED_INDEX)
        .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("内置注册表损坏：{e}")))?;
    idx.source = IndexSource::Bundled;
    Ok(idx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_index_parses() {
        let idx = bundled_index().expect("bundled");
        assert!(idx.schema_version >= 1);
    }

    #[test]
    fn registry_entry_accepts_author_string() {
        let entry: RegistryEntry = serde_json::from_str(
            r#"{
                "id": "com.lfen.toolbag.hash-and-base64",
                "name": "Hash & Base64",
                "description": "Hash tools",
                "category": "utility",
                "latestVersion": "0.1.0",
                "downloadUrl": "https://example.com/plugin.tbpkg",
                "publishedAt": "2026-05-17T00:00:00Z",
                "author": "LFen"
            }"#,
        )
        .expect("author string");
        assert_eq!(entry.author.as_deref(), Some("LFen"));
    }

    #[test]
    fn registry_entry_accepts_author_object() {
        let entry: RegistryEntry = serde_json::from_str(
            r#"{
                "id": "com.lfen.toolbag.hash-and-base64",
                "name": "Hash & Base64",
                "description": "Hash tools",
                "category": "utility",
                "latestVersion": "0.1.0",
                "downloadUrl": "https://example.com/plugin.tbpkg",
                "publishedAt": "2026-05-17T00:00:00Z",
                "author": {
                    "name": "LFen",
                    "url": "https://github.com/LFenX"
                }
            }"#,
        )
        .expect("author object");
        assert_eq!(entry.author.as_deref(), Some("LFen"));
    }
}
