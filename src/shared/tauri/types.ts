export type RiskLevel = "safe" | "caution" | "elevated";

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  routePath: string;
  tags: string[];
  riskLevel: RiskLevel;
  requiresElevation: boolean;
  permissionRequirement: string;
  dataAccess: string;
  detailDescription: string;
  lastRunAt: string;
  runCount: number;
  averageDurationMs: number;
  lastResult: "success" | "failed" | "never";
}

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  buildProfile: string;
  dataDir: string;
  logDir: string;
}

export interface AppSettings {
  favoriteToolIds: string[];
  autoCheckUpdates: boolean;
  launchAtStartup: boolean;
  telemetryEnabled: boolean;
}

export interface ReleaseStatus {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion?: string;
  checkedAt?: string;
  message: string;
}

export interface LogExport {
  filePath: string;
  bytes: number;
}

export type EnvironmentItemStatus = "ok" | "info" | "warning" | "error" | "empty";

export interface EnvironmentSummaryMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: EnvironmentItemStatus;
}

export interface EnvironmentCategory {
  id: string;
  parentId?: string;
  label: string;
  description: string;
  count: number;
  status: EnvironmentItemStatus;
}

export type EnvironmentMetadataValue =
  | string
  | number
  | boolean
  | null
  | EnvironmentMetadataValue[]
  | { [key: string]: EnvironmentMetadataValue };

export interface EnvironmentItemDetail {
  label: string;
  value: string;
  source?: string;
  kind?: "text" | "path" | "code" | "date" | "number" | "status";
}

export interface EnvironmentItem {
  id: string;
  category: string;
  subcategory?: string;
  subcategoryLabel?: string;
  name: string;
  value: string;
  rawValue?: string;
  source: string;
  updatedAt: string;
  status: EnvironmentItemStatus;
  tags: string[];
  details?: EnvironmentItemDetail[];
  metadata?: Record<string, EnvironmentMetadataValue>;
}

export interface EnvironmentSnapshot {
  generatedAt: string;
  scanDurationMs: number;
  summary: EnvironmentSummaryMetric[];
  categories: EnvironmentCategory[];
  items: EnvironmentItem[];
  warnings: string[];
}

// ── Streaming scan event payloads ─────────────────────────────────────────────

export type ScanGroupStatus = "pending" | "running" | "done" | "failed";

export interface ScanJobStartedPayload {
  jobId: string;
  isAdmin: boolean;
  generatedAt: string;
  totalGroups: number;
}

export interface ScanGroupStartedPayload {
  jobId: string;
  group: string;
}

export interface ScanItemsPayload {
  jobId: string;
  group: string;
  items: EnvironmentItem[];
}

export interface ScanGroupDonePayload {
  jobId: string;
  group: string;
  itemCount?: number;
  status: "done" | "failed";
  error?: string;
}

export interface ScanJobDonePayload {
  jobId: string;
  durationMs: number;
}

export interface ScanJobCancelledPayload {
  jobId: string;
}

export const defaultSettings: AppSettings = {
  favoriteToolIds: ["environment-overview"],
  autoCheckUpdates: true,
  launchAtStartup: false,
  telemetryEnabled: false,
};

export const fallbackTools: ToolManifest[] = [
  {
    id: "environment-overview",
    name: "环境概览",
    description: "查看 Toolbag 当前运行环境、应用信息和 Windows 本机环境信息。",
    category: "系统",
    version: "1.0.0",
    routePath: "/tools/environment-overview",
    tags: ["系统", "诊断", "只读"],
    riskLevel: "safe",
    requiresElevation: false,
    permissionRequirement: "普通权限",
    dataAccess: "仅读取本地环境信息",
    detailDescription:
      "展示本机操作系统、CPU、内存、磁盘、网卡、进程、服务、驱动、环境变量和常用只读配置。",
    lastRunAt: "刚刚",
    runCount: 1,
    averageDurationMs: 800,
    lastResult: "success",
  },
];

const previewGeneratedAt = "2026-05-11T11:32:00.000Z";
const previewUpdatedAt = "2026-05-11 19:32";

export const fallbackEnvironmentSnapshot: EnvironmentSnapshot = {
  generatedAt: previewGeneratedAt,
  scanDurationMs: 684,
  warnings: [],
  summary: [
    {
      id: "os",
      label: "OS",
      value: "Windows 11 Pro 24H2",
      detail: "Build 26100 · x64",
      status: "ok",
    },
    {
      id: "cpu",
      label: "CPU",
      value: "Intel Core i7",
      detail: "8 核 / 16 线程",
      status: "ok",
    },
    {
      id: "memory",
      label: "Memory",
      value: "32 GB",
      detail: "可用 18.6 GB",
      status: "ok",
    },
    {
      id: "disk",
      label: "Disk",
      value: "2 卷",
      detail: "C: NVMe · 42% 可用",
      status: "ok",
    },
    {
      id: "network",
      label: "Network",
      value: "2 个适配器",
      detail: "Wi-Fi + Ethernet",
      status: "info",
    },
    {
      id: "process",
      label: "Processes",
      value: "187",
      detail: "Top RSS 已采样",
      status: "info",
    },
    {
      id: "service",
      label: "Services",
      value: "316",
      detail: "174 个正在运行",
      status: "info",
    },
    {
      id: "environment",
      label: "Variables",
      value: "72",
      detail: "Machine + User",
      status: "ok",
    },
    {
      id: "software",
      label: "Software",
      value: "46 项",
      detail: "应用 + 运行时",
      status: "info",
    },
    {
      id: "security",
      label: "Security",
      value: "12 项",
      detail: "Defender + 防火墙",
      status: "ok",
    },
  ],
  categories: [
    { id: "system", label: "系统概况", description: "Windows 版本、区域时间与计算机身份", count: 3, status: "ok" },
    { id: "system.os", parentId: "system", label: "操作系统", description: "版本、构建、启动与安装时间", count: 2, status: "ok" },
    { id: "system.identity", parentId: "system", label: "计算机身份", description: "主机名、域、型号与注册用户", count: 1, status: "info" },
    { id: "hardware", label: "硬件资源", description: "CPU、内存、主板、显卡与外设", count: 3, status: "ok" },
    { id: "hardware.cpu", parentId: "hardware", label: "CPU", description: "处理器、核心与线程", count: 1, status: "ok" },
    { id: "hardware.memory", parentId: "hardware", label: "内存", description: "总量、可用量与内存条", count: 1, status: "ok" },
    { id: "hardware.display", parentId: "hardware", label: "显示设备", description: "显卡与显示器", count: 1, status: "info" },
    { id: "storage", label: "存储", description: "物理盘、分区、卷与 BitLocker", count: 2, status: "ok" },
    { id: "storage.volume", parentId: "storage", label: "卷与文件系统", description: "盘符、容量、剩余空间与文件系统", count: 1, status: "ok" },
    { id: "storage.physical", parentId: "storage", label: "物理盘与分区", description: "物理磁盘、接口、分区与容量", count: 1, status: "info" },
    { id: "network", label: "网络", description: "适配器、IP、DNS、路由、端口与代理", count: 2, status: "info" },
    { id: "network.config", parentId: "network", label: "IP 配置", description: "IP、网关、DHCP 与 DNS", count: 1, status: "info" },
    { id: "network.port", parentId: "network", label: "监听端口", description: "TCP/UDP 本地监听端口", count: 1, status: "info" },
    { id: "process", label: "进程", description: "当前运行进程与资源占用", count: 1, status: "info" },
    { id: "process.running", parentId: "process", label: "运行中", description: "进程 ID、内存与路径", count: 1, status: "info" },
    { id: "service", label: "服务", description: "Windows 服务状态与启动模式", count: 1, status: "info" },
    { id: "service.windows", parentId: "service", label: "Windows 服务", description: "服务状态、启动模式与命令行", count: 1, status: "info" },
    { id: "driver", label: "驱动", description: "系统驱动状态", count: 1, status: "info" },
    { id: "driver.system", parentId: "driver", label: "系统驱动", description: "驱动状态、启动模式与路径", count: 1, status: "info" },
    { id: "environment", label: "环境变量", description: "Machine 与 User 环境变量", count: 2, status: "ok" },
    { id: "environment.user", parentId: "environment", label: "User 变量", description: "用户级环境变量", count: 2, status: "ok" },
    { id: "path", label: "PATH", description: "PATH 条目拆分、来源与路径状态", count: 2, status: "ok" },
    { id: "path.machine", parentId: "path", label: "Machine PATH", description: "系统 PATH 条目", count: 2, status: "ok" },
    { id: "software", label: "软件与运行时", description: "已安装应用、开发运行时与 Shell 配置", count: 3, status: "info" },
    { id: "software.installed", parentId: "software", label: "已安装应用", description: "卸载注册表中可读取的应用", count: 1, status: "info" },
    { id: "software.runtime", parentId: "software", label: "开发运行时", description: "常见 CLI 和运行时路径", count: 1, status: "ok" },
    { id: "software.shell", parentId: "software", label: "Shell 配置", description: "PowerShell 配置文件", count: 1, status: "empty" },
    { id: "security", label: "安全状态", description: "Defender、防火墙、证书与系统保护", count: 2, status: "ok" },
    { id: "security.defender", parentId: "security", label: "Defender", description: "Microsoft Defender 状态", count: 1, status: "ok" },
    { id: "security.firewall", parentId: "security", label: "防火墙", description: "Windows 防火墙配置文件", count: 1, status: "ok" },
    { id: "automation", label: "启动与任务", description: "启动项和计划任务", count: 1, status: "info" },
    { id: "automation.startup", parentId: "automation", label: "启动项", description: "Run 注册表和启动目录", count: 1, status: "info" },
    { id: "registry", label: "注册表可读项", description: "安全白名单注册表信息", count: 1, status: "info" },
    { id: "registry.windows", parentId: "registry", label: "Windows 项", description: "CurrentVersion 等系统键", count: 1, status: "info" },
    { id: "app", label: "应用目录", description: "Toolbag 数据、日志与运行目录", count: 1, status: "ok" },
    { id: "app.directory", parentId: "app", label: "Toolbag 目录", description: "数据、日志与可执行文件", count: 1, status: "ok" },
    { id: "permission", label: "日志与权限", description: "普通权限、日志目录与只读边界", count: 1, status: "ok" },
    { id: "permission.boundary", parentId: "permission", label: "权限边界", description: "身份、执行策略与只读说明", count: 1, status: "ok" },
  ],
  items: [
    {
      id: "system-os",
      category: "system",
      subcategory: "system.os",
      subcategoryLabel: "操作系统",
      name: "Windows 版本",
      value: "Windows 11 Pro 24H2 · Build 26100.3775",
      rawValue: "ProductName=Windows 11 Pro; DisplayVersion=24H2; CurrentBuild=26100",
      source: "HKLM + Win32_OperatingSystem",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["windows", "os", "version", "系统"],
    },
    {
      id: "system-arch",
      category: "system",
      subcategory: "system.os",
      subcategoryLabel: "操作系统",
      name: "系统架构",
      value: "64-bit · x64-based PC",
      source: "Win32_OperatingSystem",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["architecture", "x64", "系统"],
    },
    {
      id: "system-computer",
      category: "system",
      subcategory: "system.identity",
      subcategoryLabel: "计算机身份",
      name: "计算机名",
      value: "LFEN-WORKSTATION",
      source: "Win32_ComputerSystem",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["computer", "hostname"],
    },
    {
      id: "hardware-cpu",
      category: "hardware",
      subcategory: "hardware.cpu",
      subcategoryLabel: "CPU",
      name: "CPU",
      value: "Intel Core i7-13700H · 8 核 / 16 线程",
      source: "Win32_Processor",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["cpu", "processor", "硬件"],
    },
    {
      id: "hardware-memory",
      category: "hardware",
      subcategory: "hardware.memory",
      subcategoryLabel: "内存",
      name: "物理内存",
      value: "32 GB 总计 · 18.6 GB 可用",
      source: "Win32_OperatingSystem",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["memory", "ram", "内存"],
    },
    {
      id: "hardware-gpu-preview",
      category: "hardware",
      subcategory: "hardware.display",
      subcategoryLabel: "显示设备",
      name: "显卡",
      value: "NVIDIA RTX · Driver 551.86",
      rawValue: "{\"Name\":\"NVIDIA RTX\",\"DriverVersion\":\"551.86\"}",
      source: "Win32_VideoController",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["gpu", "display", "硬件"],
      details: [
        { label: "驱动版本", value: "551.86", source: "Win32_VideoController" },
      ],
    },
    {
      id: "storage-c",
      category: "storage",
      subcategory: "storage.volume",
      subcategoryLabel: "卷与文件系统",
      name: "C: 系统卷",
      value: "NVMe · NTFS · 476 GB 总计 · 202 GB 可用",
      rawValue: "DeviceID=C:; FileSystem=NTFS; Size=511101108224; FreeSpace=216895848448",
      source: "Win32_LogicalDisk",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["disk", "nvme", "c:", "storage"],
      metadata: { path: "C:\\" },
    },
    {
      id: "storage-physical-preview",
      category: "storage",
      subcategory: "storage.physical",
      subcategoryLabel: "物理盘与分区",
      name: "物理磁盘",
      value: "Samsung NVMe · 512 GB",
      rawValue: "{\"Model\":\"Samsung NVMe\",\"InterfaceType\":\"NVMe\",\"Size\":512000000000}",
      source: "Win32_DiskDrive",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["disk", "storage", "nvme"],
      metadata: { size: 512000000000, status: "OK" },
    },
    {
      id: "network-wifi",
      category: "network",
      subcategory: "network.config",
      subcategoryLabel: "IP 配置",
      name: "Wi-Fi 适配器",
      value: "Intel Wi-Fi 6 AX201 · 192.168.1.42 · DHCP",
      rawValue: "MAC=8C-17-59-40-22-10; Gateway=192.168.1.1; DNS=223.5.5.5, 1.1.1.1",
      source: "Win32_NetworkAdapterConfiguration",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["wifi", "network", "ip", "dns"],
    },
    {
      id: "port-tcp-preview",
      category: "network",
      subcategory: "network.port",
      subcategoryLabel: "监听端口",
      name: "TCP 127.0.0.1:5173",
      value: "监听中 · PID 12888",
      rawValue: "{\"LocalAddress\":\"127.0.0.1\",\"LocalPort\":5173,\"OwningProcess\":12888}",
      source: "Get-NetTCPConnection",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["tcp", "port", "network"],
      metadata: { processId: 12888, status: "Listen" },
    },
    {
      id: "process-count",
      category: "process",
      subcategory: "process.running",
      subcategoryLabel: "运行中",
      name: "运行进程数",
      value: "187 个进程",
      source: "Get-Process",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["process", "进程"],
    },
    {
      id: "service-count",
      category: "service",
      subcategory: "service.windows",
      subcategoryLabel: "Windows 服务",
      name: "服务数量",
      value: "316 个服务 · 174 个正在运行",
      source: "Win32_Service",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["service", "服务"],
    },
    {
      id: "driver-count",
      category: "driver",
      subcategory: "driver.system",
      subcategoryLabel: "系统驱动",
      name: "系统驱动",
      value: "246 个驱动 · 209 个正在运行",
      source: "Win32_SystemDriver",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["driver", "驱动"],
    },
    {
      id: "env-temp",
      category: "environment",
      subcategory: "environment.user",
      subcategoryLabel: "User 变量",
      name: "TEMP",
      value: "C:\\Users\\LFen\\AppData\\Local\\Temp",
      rawValue: "C:\\Users\\LFen\\AppData\\Local\\Temp",
      source: "User",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["temp", "environment", "变量"],
      metadata: { path: "C:\\Users\\LFen\\AppData\\Local\\Temp" },
    },
    {
      id: "env-userprofile",
      category: "environment",
      subcategory: "environment.user",
      subcategoryLabel: "User 变量",
      name: "USERPROFILE",
      value: "C:\\Users\\LFen",
      source: "User",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["userprofile", "environment", "profile"],
      metadata: { path: "C:\\Users\\LFen" },
    },
    {
      id: "path-combined",
      category: "path",
      subcategory: "path.machine",
      subcategoryLabel: "Machine PATH",
      name: "PATH",
      value: "38 个条目 · Machine + User",
      rawValue:
        "C:\\Windows\\System32;C:\\Windows;C:\\Program Files\\PowerShell\\7;D:\\toolbag\\node_modules\\.bin",
      source: "Machine + User",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["PATH", "path", "environment", "变量"],
    },
    {
      id: "path-pwsh",
      category: "path",
      subcategory: "path.machine",
      subcategoryLabel: "Machine PATH",
      name: "PATH · PowerShell",
      value: "C:\\Program Files\\PowerShell\\7",
      rawValue: "C:\\Program Files\\PowerShell\\7",
      source: "Machine PATH",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["PATH", "powershell", "path"],
      metadata: { path: "C:\\Program Files\\PowerShell\\7" },
    },
    {
      id: "runtime-node",
      category: "software",
      subcategory: "software.runtime",
      subcategoryLabel: "开发运行时",
      name: "node",
      value: "C:\\Program Files\\nodejs\\node.exe",
      rawValue: "{\"Name\":\"node\",\"Found\":true,\"Paths\":[\"C:\\\\Program Files\\\\nodejs\\\\node.exe\"]}",
      source: "where.exe",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["runtime", "node", "developer"],
      metadata: { paths: ["C:\\Program Files\\nodejs\\node.exe"], exists: true },
    },
    {
      id: "software-app-preview",
      category: "software",
      subcategory: "software.installed",
      subcategoryLabel: "已安装应用",
      name: "Microsoft PowerShell",
      value: "7.5.0 · Microsoft Corporation",
      rawValue: "{\"DisplayName\":\"Microsoft PowerShell\",\"DisplayVersion\":\"7.5.0\"}",
      source: "Uninstall registry allowlist",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["software", "installed", "powershell"],
      metadata: { publisher: "Microsoft Corporation", version: "7.5.0", scope: "Machine" },
    },
    {
      id: "shell-profile-preview",
      category: "software",
      subcategory: "software.shell",
      subcategoryLabel: "Shell 配置",
      name: "PowerShell Profile · CurrentUserCurrentHost",
      value: "C:\\Users\\LFen\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1",
      source: "$PROFILE",
      updatedAt: previewUpdatedAt,
      status: "empty",
      tags: ["powershell", "profile", "shell"],
      metadata: {
        path: "C:\\Users\\LFen\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1",
        exists: false,
      },
    },
    {
      id: "defender-status",
      category: "security",
      subcategory: "security.defender",
      subcategoryLabel: "Defender",
      name: "Microsoft Defender",
      value: "防病毒 true · 实时保护 true",
      rawValue: "{\"AntivirusEnabled\":true,\"RealTimeProtectionEnabled\":true}",
      source: "Get-MpComputerStatus",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["defender", "security", "antivirus"],
      details: [
        { label: "实时保护", value: "true", source: "Get-MpComputerStatus", kind: "status" },
      ],
    },
    {
      id: "firewall-profile-domain",
      category: "security",
      subcategory: "security.firewall",
      subcategoryLabel: "防火墙",
      name: "防火墙 · Domain",
      value: "启用 true",
      source: "Get-NetFirewallProfile",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["firewall", "security", "network"],
      metadata: { inbound: "Block", outbound: "Allow" },
    },
    {
      id: "startup-preview",
      category: "automation",
      subcategory: "automation.startup",
      subcategoryLabel: "启动项",
      name: "Windows Terminal",
      value: "C:\\Program Files\\WindowsApps\\Microsoft.WindowsTerminal\\wt.exe",
      source: "Run keys + Startup folders",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["startup", "run", "automation"],
      metadata: { scope: "User", source: "HKCU Run" },
    },
    {
      id: "registry-current-version",
      category: "registry",
      subcategory: "registry.windows",
      subcategoryLabel: "Windows 项",
      name: "Windows CurrentVersion",
      value: "Windows 11 Pro · 24H2 · 26100",
      rawValue: "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
      source: "HKLM allowlist",
      updatedAt: previewUpdatedAt,
      status: "info",
      tags: ["registry", "windows", "version"],
    },
    {
      id: "app-data",
      category: "app",
      subcategory: "app.directory",
      subcategoryLabel: "Toolbag 目录",
      name: "Toolbag 数据目录",
      value: "C:\\Users\\LFen\\AppData\\Roaming\\com.lfen.toolbag",
      source: "Tauri app_data_dir",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["toolbag", "data", "app"],
      metadata: { path: "C:\\Users\\LFen\\AppData\\Roaming\\com.lfen.toolbag" },
    },
    {
      id: "permission-mode",
      category: "permission",
      subcategory: "permission.boundary",
      subcategoryLabel: "权限边界",
      name: "运行权限",
      value: "普通权限 · 只读扫描",
      rawValue: "No elevation required. No telemetry. No write operation during scan.",
      source: "Toolbag policy",
      updatedAt: previewUpdatedAt,
      status: "ok",
      tags: ["permission", "readonly", "安全"],
    },
  ],
};
