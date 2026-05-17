use std::collections::HashSet;

use crate::database::Database;
use crate::errors::{AppError, AppResult};
use crate::models::{StaticToolManifest, ToolManifest};

const TOOL_MANIFEST_JSON: &str = include_str!("../../../src/shared/tools/manifest.json");

pub fn list_tools(database: &Database) -> AppResult<Vec<ToolManifest>> {
    static_tool_manifests()?
        .into_iter()
        .map(|metadata| {
            let summary = database.tool_run_summary(&metadata.id)?;
            Ok(ToolManifest::from_metadata(metadata, summary))
        })
        .collect()
}

fn static_tool_manifests() -> AppResult<Vec<StaticToolManifest>> {
    let manifests: Vec<StaticToolManifest> = serde_json::from_str(TOOL_MANIFEST_JSON)?;
    validate_static_tool_manifests(&manifests)?;
    Ok(manifests)
}

fn validate_static_tool_manifests(manifests: &[StaticToolManifest]) -> AppResult<()> {
    let mut ids = HashSet::new();
    let mut routes = HashSet::new();

    for manifest in manifests {
        if manifest.id.trim().is_empty() {
            return Err(AppError::Message(
                "tool manifest contains an empty id".to_string(),
            ));
        }
        if !ids.insert(manifest.id.as_str()) {
            return Err(AppError::Message(format!(
                "duplicate tool manifest id: {}",
                manifest.id
            )));
        }
        if !routes.insert(manifest.route_path.as_str()) {
            return Err(AppError::Message(format!(
                "duplicate tool route: {}",
                manifest.route_path
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_manifest_parses() {
        let manifests = static_tool_manifests().expect("manifest");

        assert!(manifests
            .iter()
            .any(|manifest| manifest.id == "environment-overview"));
    }

    #[test]
    fn shared_manifest_ids_and_routes_are_unique() {
        let manifests = static_tool_manifests().expect("manifest");

        validate_static_tool_manifests(&manifests).expect("unique manifest");
    }
}
