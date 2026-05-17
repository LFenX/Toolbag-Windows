use crate::models::{LastResult, RiskLevel, ToolManifest};

pub fn list_tools() -> Vec<ToolManifest> {
    vec![ToolManifest {
        id: "environment-overview".to_string(),
        name: "环境概览".to_string(),
        description: "查看 Toolbag 当前运行环境、应用信息和 Windows 本机环境信息。".to_string(),
        category: "系统".to_string(),
        version: "1.0.0".to_string(),
        route_path: "/tools/environment-overview".to_string(),
        tags: vec!["系统".to_string(), "诊断".to_string(), "只读".to_string()],
        risk_level: RiskLevel::Safe,
        requires_elevation: false,
        permission_requirement: "普通权限".to_string(),
        data_access: "仅读取本地环境信息".to_string(),
        detail_description:
            "展示本机操作系统、CPU、内存、磁盘、网卡、进程、服务、驱动、环境变量和常用只读配置。"
                .to_string(),
        last_run_at: "刚刚".to_string(),
        run_count: 1,
        average_duration_ms: 800,
        last_result: LastResult::Success,
    }]
}
