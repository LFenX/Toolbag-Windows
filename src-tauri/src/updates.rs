use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::errors::AppResult;
use crate::models::ReleaseStatus;

pub fn current_status(current_version: &str) -> ReleaseStatus {
    ReleaseStatus {
        current_version: current_version.to_string(),
        update_available: false,
        latest_version: None,
        checked_at: None,
        message: "更新器已预留，等待配置 GitHub Release 签名与端点。".to_string(),
    }
}

pub fn check(current_version: &str) -> AppResult<ReleaseStatus> {
    let checked_at = OffsetDateTime::now_utc().format(&Rfc3339)?;

    Ok(ReleaseStatus {
        current_version: current_version.to_string(),
        update_available: false,
        latest_version: None,
        checked_at: Some(checked_at),
        message: "已完成本地更新检查；发布端点尚未配置。".to_string(),
    })
}
