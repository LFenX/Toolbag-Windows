use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::errors::AppResult;
use crate::models::ReleaseStatus;

pub fn current_status(current_version: &str) -> ReleaseStatus {
    ReleaseStatus {
        current_version: current_version.to_string(),
        update_available: false,
        latest_version: None,
        checked_at: None,
        message: updater_status_message().to_string(),
    }
}

pub fn check(current_version: &str) -> AppResult<ReleaseStatus> {
    let checked_at = OffsetDateTime::now_utc().format(&Rfc3339)?;

    Ok(ReleaseStatus {
        current_version: current_version.to_string(),
        update_available: false,
        latest_version: None,
        checked_at: Some(checked_at),
        message: updater_status_message().to_string(),
    })
}

fn updater_status_message() -> &'static str {
    "更新器已接入，请在设置页使用主程序更新完成检查、下载、安装和重启。"
}
