pub mod scan;

use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::errors::{AppError, AppResult};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvironmentItemStatus {
    Ok,
    Info,
    Warning,
    Error,
    Empty,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSummaryMetric {
    pub id: String,
    pub label: String,
    pub value: String,
    pub detail: String,
    pub status: EnvironmentItemStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentCategory {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub label: String,
    pub description: String,
    pub count: usize,
    pub status: EnvironmentItemStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentItemDetail {
    pub label: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentItem {
    pub id: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcategory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcategory_label: Option<String>,
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_value: Option<String>,
    pub source: String,
    pub updated_at: String,
    pub status: EnvironmentItemStatus,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub details: Vec<EnvironmentItemDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSnapshot {
    pub generated_at: String,
    pub scan_duration_ms: u128,
    pub summary: Vec<EnvironmentSummaryMetric>,
    pub categories: Vec<EnvironmentCategory>,
    pub items: Vec<EnvironmentItem>,
    pub warnings: Vec<String>,
}

struct PushItem<'a> {
    id: &'a str,
    category: &'a str,
    name: &'a str,
    value: String,
    raw_value: Option<String>,
    source: &'a str,
    updated_at: &'a str,
    status: EnvironmentItemStatus,
    tags: Vec<&'a str>,
    metadata: Option<BTreeMap<String, Value>>,
}

pub fn collect_environment_snapshot(data_dir: &Path, log_dir: &Path) -> EnvironmentSnapshot {
    let started = Instant::now();
    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let updated_at = generated_at.clone();
    let mut warnings = Vec::new();
    let payload = match collect_windows_payload() {
        Ok(payload) => payload,
        Err(error) => {
            warnings.push(format!("Windows 环境采集降级：{error}"));
            Value::Object(Default::default())
        }
    };
    for warning in string_array(payload.get("warnings")) {
        warnings.push(warning);
    }

    let mut items = Vec::new();
    populate_system_items(&payload, &mut items, &updated_at);
    populate_hardware_items(&payload, &mut items, &updated_at);
    populate_storage_items(&payload, &mut items, &updated_at);
    populate_network_items(&payload, &mut items, &updated_at);
    populate_process_items(&payload, &mut items, &updated_at);
    populate_service_items(&payload, &mut items, &updated_at);
    populate_driver_items(&payload, &mut items, &updated_at);
    populate_environment_items(&payload, &mut items, &updated_at);
    populate_path_items(&payload, &mut items, &updated_at);
    populate_software_items(&payload, &mut items, &updated_at);
    populate_automation_items(&payload, &mut items, &updated_at);
    populate_security_items(&payload, &mut items, &updated_at);
    populate_registry_items(&payload, &mut items, &updated_at);
    populate_app_items(data_dir, log_dir, &mut items, &updated_at);
    populate_permission_items(&payload, &mut items, &updated_at);

    let categories = build_categories(&items);
    let summary = build_summary(&payload, &items);

    EnvironmentSnapshot {
        generated_at,
        scan_duration_ms: started.elapsed().as_millis(),
        summary,
        categories,
        items,
        warnings,
    }
}

fn collect_windows_payload() -> AppResult<Value> {
    if !cfg!(windows) {
        return Err(AppError::Message("当前系统不是 Windows，已使用预览数据结构。".to_string()));
    }

    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$limit = 1000
$warnings = New-Object System.Collections.Generic.List[string]
function Add-Warning([string]$text) {
  if ($text) { $warnings.Add($text) | Out-Null }
}
function Safe([string]$name, [scriptblock]$block) {
  try { & $block } catch { Add-Warning "$name 读取失败：$($_.Exception.Message)"; @() }
}
function Limited([string]$name, $items) {
  $arr = @($items)
  if ($arr.Count -gt $limit) {
    Add-Warning "$name 项数 $($arr.Count) 超过 $limit，已截断。"
    return @($arr | Select-Object -First $limit)
  }
  return $arr
}
function EnvMap($target) {
  $result = [ordered]@{}
  try {
    [Environment]::GetEnvironmentVariables($target).GetEnumerator() |
      Sort-Object Name |
      ForEach-Object { $result[[string]$_.Name] = [string]$_.Value }
  } catch {
    Add-Warning "$target 环境变量读取失败：$($_.Exception.Message)"
  }
  $result
}
function FileSnapshot([string]$path) {
  $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  if ($item) {
    [pscustomobject]@{
      Path = $path
      Exists = $true
      Length = $item.Length
      LastWriteTime = $item.LastWriteTime.ToString('o')
    }
  } else {
    [pscustomobject]@{
      Path = $path
      Exists = $false
      Length = $null
      LastWriteTime = $null
    }
  }
}
function Get-UninstallApps {
  $paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($path in $paths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName } |
      Select-Object @{n='Scope';e={ if ($path.StartsWith('HKCU')) { 'User' } else { 'Machine' } }},
        DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation, UninstallString
  }
}
function Get-StartupItems {
  $registryPaths = @(
    @{ Scope = 'Machine'; Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' },
    @{ Scope = 'Machine'; Path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' },
    @{ Scope = 'User'; Path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' }
  )
  foreach ($entry in $registryPaths) {
    $props = Get-ItemProperty $entry.Path -ErrorAction SilentlyContinue
    if ($props) {
      $props.PSObject.Properties |
        Where-Object { $_.Name -notlike 'PS*' } |
        ForEach-Object {
          [pscustomobject]@{ Scope = $entry.Scope; Name = $_.Name; Command = [string]$_.Value; Source = $entry.Path }
        }
    }
  }
  $folders = @(
    [Environment]::GetFolderPath('Startup'),
    [Environment]::GetFolderPath('CommonStartup')
  ) | Where-Object { $_ }
  foreach ($folder in $folders) {
    Get-ChildItem -LiteralPath $folder -Force -ErrorAction SilentlyContinue |
      ForEach-Object {
        [pscustomobject]@{ Scope = 'Folder'; Name = $_.Name; Command = $_.FullName; Source = $folder }
      }
  }
}
function Get-RuntimeTools {
  $tools = @('git','node','npm','pnpm','python','py','cargo','rustc','dotnet','java','go','code','pwsh','powershell','winget','docker','wsl')
  foreach ($tool in $tools) {
    $paths = @(where.exe $tool 2>$null)
    [pscustomobject]@{
      Name = $tool
      Found = ($paths.Count -gt 0)
      Paths = $paths
    }
  }
}
$isAdmin = Safe 'Windows identity' {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$services = @(Safe 'Win32_Service' { Get-CimInstance Win32_Service })
$drivers = @(Safe 'Win32_SystemDriver' { Get-CimInstance Win32_SystemDriver })
$processes = @(Safe 'Get-Process' { Get-Process })
$payload = [ordered]@{
  os = Safe 'Win32_OperatingSystem' {
    Get-CimInstance Win32_OperatingSystem |
      Select-Object Caption, Version, BuildNumber, OSArchitecture,
        @{n='InstallDate';e={$_.InstallDate.ToString('o')}},
        @{n='LastBootUpTime';e={$_.LastBootUpTime.ToString('o')}},
        TotalVisibleMemorySize, FreePhysicalMemory, RegisteredUser, SerialNumber,
        Locale, CountryCode, CurrentTimeZone, WindowsDirectory, SystemDirectory
  }
  computer = Safe 'Win32_ComputerSystem' {
    Get-CimInstance Win32_ComputerSystem |
      Select-Object Name, Domain, Manufacturer, Model, TotalPhysicalMemory,
        NumberOfProcessors, NumberOfLogicalProcessors, SystemType, UserName, Workgroup
  }
  timezone = Safe 'Get-TimeZone' {
    Get-TimeZone | Select-Object Id, DisplayName, @{n='BaseUtcOffset';e={$_.BaseUtcOffset.ToString()}}, SupportsDaylightSavingTime
  }
  culture = Safe 'Get-Culture' {
    [pscustomobject]@{
      Culture = (Get-Culture).Name
      DisplayName = (Get-Culture).DisplayName
      UICulture = (Get-UICulture).Name
      UIName = (Get-UICulture).DisplayName
    }
  }
  cpus = @(Safe 'Win32_Processor' { Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation, ProcessorId, Architecture })
  bios = Safe 'Win32_BIOS' { Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, @{n='ReleaseDate';e={$_.ReleaseDate.ToString('o')}}, SerialNumber }
  baseboard = Safe 'Win32_BaseBoard' { Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, Version, SerialNumber }
  memoryModules = @(Limited '内存条' (Safe 'Win32_PhysicalMemory' { Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, DeviceLocator, Manufacturer, PartNumber, SerialNumber, Capacity, Speed, ConfiguredClockSpeed }))
  gpus = @(Limited '显卡' (Safe 'Win32_VideoController' { Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor, CurrentHorizontalResolution, CurrentVerticalResolution }))
  monitors = @(Limited '显示器' (Safe 'Win32_DesktopMonitor' { Get-CimInstance Win32_DesktopMonitor | Select-Object Name, MonitorType, ScreenWidth, ScreenHeight, Status }))
  batteries = @(Limited '电池' (Safe 'Win32_Battery' { Get-CimInstance Win32_Battery | Select-Object Name, BatteryStatus, EstimatedChargeRemaining, EstimatedRunTime }))
  powerPlan = Safe 'powercfg' { (powercfg /GetActiveScheme) -join "`n" }
  secureBoot = Safe 'Confirm-SecureBootUEFI' { Confirm-SecureBootUEFI }
  tpm = Safe 'Get-Tpm' { Get-Tpm | Select-Object TpmPresent, TpmReady, TpmEnabled, ManagedAuthLevel, ManufacturerIdTxt }
  pnpDevices = @(Limited 'PnP 设备' (Safe 'Get-PnpDevice' { Get-PnpDevice -PresentOnly | Select-Object Status, Class, FriendlyName, InstanceId }))
  logicalDisks = @(Safe 'Win32_LogicalDisk' { Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, DriveType, FileSystem, Size, FreeSpace })
  physicalDisks = @(Safe 'Win32_DiskDrive' { Get-CimInstance Win32_DiskDrive | Select-Object Model, InterfaceType, Size, MediaType, SerialNumber, Status })
  partitions = @(Limited '分区' (Safe 'Get-Partition' { Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, Type, Size, Offset, IsActive, IsBoot, IsSystem }))
  volumes = @(Limited '卷' (Safe 'Get-Volume' { Get-Volume | Select-Object DriveLetter, FileSystemLabel, FileSystem, HealthStatus, OperationalStatus, Size, SizeRemaining, DriveType }))
  bitlocker = @(if ($isAdmin) { Safe 'Get-BitLockerVolume' { Get-BitLockerVolume | Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod } } else { Add-Warning 'BitLocker 需要管理员权限，已跳过。'; @() })
  networkConfigs = @(Safe 'Win32_NetworkAdapterConfiguration' { Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true } | Select-Object Description, MACAddress, IPAddress, IPSubnet, DefaultIPGateway, DHCPEnabled, DHCPServer, DNSServerSearchOrder })
  netAdapters = @(Limited '网络适配器' (Safe 'Get-NetAdapter' { Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress, InterfaceIndex }))
  routes = @(Limited '路由' (Safe 'Get-NetRoute' { Get-NetRoute | Select-Object DestinationPrefix, NextHop, InterfaceAlias, RouteMetric, AddressFamily }))
  tcpListeners = @(Limited 'TCP 监听端口' (Safe 'Get-NetTCPConnection' { Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess, State }))
  udpListeners = @(Limited 'UDP 监听端口' (Safe 'Get-NetUDPEndpoint' { Get-NetUDPEndpoint | Select-Object LocalAddress, LocalPort, OwningProcess }))
  proxy = Safe 'Internet Settings' { Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' | Select-Object ProxyEnable, ProxyServer, AutoConfigURL }
  hostsFile = FileSnapshot "$env:SystemRoot\System32\drivers\etc\hosts"
  processCount = $processes.Count
  processes = @(Limited '进程' ($processes | Sort-Object ProcessName | Select-Object ProcessName, Id, CPU, WorkingSet64, Path, MainWindowTitle))
  serviceCount = $services.Count
  runningServiceCount = @($services | Where-Object { $_.State -eq 'Running' }).Count
  services = @(Limited '服务' ($services | Sort-Object DisplayName | Select-Object Name, DisplayName, State, StartMode, PathName, Description))
  driverCount = $drivers.Count
  runningDriverCount = @($drivers | Where-Object { $_.State -eq 'Running' }).Count
  drivers = @(Limited '驱动' ($drivers | Sort-Object DisplayName | Select-Object Name, DisplayName, State, StartMode, PathName, Description))
  envMachine = EnvMap 'Machine'
  envUser = EnvMap 'User'
  pathMachine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  pathUser = [Environment]::GetEnvironmentVariable('Path', 'User')
  shellProfiles = @(Safe 'PowerShell profiles' {
    @(
      @{ Scope = 'CurrentUserCurrentHost'; Path = $PROFILE.CurrentUserCurrentHost },
      @{ Scope = 'CurrentUserAllHosts'; Path = $PROFILE.CurrentUserAllHosts },
      @{ Scope = 'AllUsersCurrentHost'; Path = $PROFILE.AllUsersCurrentHost },
      @{ Scope = 'AllUsersAllHosts'; Path = $PROFILE.AllUsersAllHosts }
    ) | ForEach-Object {
      [pscustomobject]@{ Scope = $_.Scope; Path = $_.Path; Exists = (Test-Path -LiteralPath $_.Path) }
    }
  })
  runtimeTools = @(Safe 'runtime tools' { Get-RuntimeTools })
  installedApps = @(Limited '已安装应用' (Safe 'installed apps' { Get-UninstallApps | Sort-Object DisplayName }))
  startupItems = @(Limited '启动项' (Safe 'startup items' { Get-StartupItems | Sort-Object Name }))
  scheduledTasks = @(Limited '计划任务' (Safe 'scheduled tasks' { Get-ScheduledTask | Select-Object TaskName, TaskPath, State, Author, Description }))
  defender = Safe 'Defender' { Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntispywareEnabled, NISEnabled, AntivirusSignatureLastUpdated, QuickScanEndTime, FullScanEndTime }
  firewallProfiles = @(Safe 'Firewall profiles' { Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, NotifyOnListen })
  certificates = @(Limited '证书' (Safe 'certificates' {
    foreach ($store in @('Cert:\CurrentUser\My','Cert:\LocalMachine\My','Cert:\LocalMachine\Root')) {
      Get-ChildItem $store -ErrorAction SilentlyContinue |
        Select-Object @{n='Store';e={$store}}, Subject, Issuer, Thumbprint, @{n='NotAfter';e={$_.NotAfter.ToString('o')}}
    }
  }))
  eventLogs = @(Limited '事件日志' (Safe 'event logs' { Get-WinEvent -ListLog * | Select-Object LogName, RecordCount, MaximumSizeInBytes, IsEnabled, @{n='LastWriteTime';e={ if ($_.LastWriteTime) { $_.LastWriteTime.ToString('o') } else { $null } }} }))
  registry = [ordered]@{
    currentVersion = Safe 'CurrentVersion registry' { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, DisplayVersion, CurrentBuild, Ubr, EditionID, InstallationType, ReleaseId }
    powershell = Safe 'PowerShell registry' { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine' | Select-Object PowerShellVersion, RuntimeVersion }
  }
  permissions = [ordered]@{
    isAdmin = $isAdmin
    executionPolicy = (Safe 'Get-ExecutionPolicy' { Get-ExecutionPolicy })
    userName = [Environment]::UserName
    userDomainName = [Environment]::UserDomainName
  }
}
$payload['warnings'] = @($warnings)
$payload | ConvertTo-Json -Depth 10 -Compress
"#;

    let stdout = run_powershell(script, Duration::from_secs(90))?;
    let json_text = extract_json_object(&stdout)
        .ok_or_else(|| AppError::Message("PowerShell 未返回 JSON 环境快照。".to_string()))?;
    Ok(serde_json::from_str(json_text)?)
}

fn run_powershell(script: &str, timeout: Duration) -> AppResult<String> {
    let mut command = Command::new("powershell.exe");
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // The child can emit several megabytes of JSON. Windows pipe buffers are
    // ~64 KB, so the child will block on write — and try_wait() will spin
    // forever — unless we drain stdout/stderr on background threads.
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Message("PowerShell 子进程缺少 stdout。".to_string()))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Message("PowerShell 子进程缺少 stderr。".to_string()))?;
    let stdout_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.read_to_end(&mut buffer);
        buffer
    });
    let stderr_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr.read_to_end(&mut buffer);
        buffer
    });

    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            let stdout_bytes = stdout_reader.join().unwrap_or_default();
            let stderr_bytes = stderr_reader.join().unwrap_or_default();
            if !status.success() {
                let stderr_text = String::from_utf8_lossy(&stderr_bytes).trim().to_string();
                return Err(AppError::Message(if stderr_text.is_empty() {
                    "PowerShell 环境采集失败。".to_string()
                } else {
                    stderr_text
                }));
            }
            return Ok(String::from_utf8_lossy(&stdout_bytes).to_string());
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(AppError::Message("PowerShell 环境采集超时。".to_string()));
        }

        thread::sleep(Duration::from_millis(40));
    }
}

fn populate_system_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let os_name = field(payload, "os", "Caption").unwrap_or_else(|| "未知 Windows".to_string());
    let version = field(payload, "os", "Version").unwrap_or_else(|| "未知版本".to_string());
    let build = field(payload, "os", "BuildNumber").unwrap_or_else(|| "未知构建".to_string());
    push_item(
        items,
        PushItem {
            id: "system-os",
            category: "system",
            name: "Windows 版本",
            value: format!("{os_name} · {version} · Build {build}"),
            raw_value: Some(object_raw(payload.get("os"))),
            source: "Win32_OperatingSystem",
            updated_at,
            status: EnvironmentItemStatus::Ok,
            tags: vec!["windows", "os", "version", "系统"],
            metadata: None,
        },
    );

    for (id, label, key) in [
        ("system-arch", "系统架构", "OSArchitecture"),
        ("system-boot", "最近启动时间", "LastBootUpTime"),
        ("system-install", "安装时间", "InstallDate"),
        ("system-registered-user", "注册用户", "RegisteredUser"),
    ] {
        push_optional_field(
            items,
            id,
            "system",
            label,
            payload,
            "os",
            key,
            "Win32_OperatingSystem",
            updated_at,
            vec!["windows", "system"],
        );
    }

    for (id, label, key) in [
        ("system-computer", "计算机名", "Name"),
        ("system-domain", "域 / 工作组", "Domain"),
        ("system-manufacturer", "设备厂商", "Manufacturer"),
        ("system-model", "设备型号", "Model"),
        ("system-user", "当前登录用户", "UserName"),
    ] {
        push_optional_field(
            items,
            id,
            "system",
            label,
            payload,
            "computer",
            key,
            "Win32_ComputerSystem",
            updated_at,
            vec!["computer", "system"],
        );
    }

    push_optional_field(
        items,
        "system-timezone",
        "system",
        "时区",
        payload,
        "timezone",
        "DisplayName",
        "Get-TimeZone",
        updated_at,
        vec!["time", "timezone", "system"],
    );
    push_optional_field(
        items,
        "system-culture",
        "system",
        "区域语言",
        payload,
        "culture",
        "DisplayName",
        "Get-Culture",
        updated_at,
        vec!["culture", "locale", "system"],
    );
}

fn populate_hardware_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    for_each_arrayish(payload.get("cpus"), |cpu, index| {
        let name = child_field(cpu, "Name").unwrap_or_else(|| "未知 CPU".to_string());
        let cores = child_field(cpu, "NumberOfCores").unwrap_or_else(|| "?".to_string());
        let logical =
            child_field(cpu, "NumberOfLogicalProcessors").unwrap_or_else(|| "?".to_string());
        let clock = child_field(cpu, "MaxClockSpeed").unwrap_or_else(|| "?".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("hardware-cpu-{index}"),
                category: "hardware",
                name: if index == 0 { "CPU" } else { "CPU 线程组" },
                value: format!("{name} · {cores} 核 / {logical} 线程 · {clock} MHz"),
                raw_value: Some(object_raw(Some(cpu))),
                source: "Win32_Processor",
                updated_at,
                status: EnvironmentItemStatus::Ok,
                tags: vec!["cpu", "processor", "hardware", "硬件"],
                metadata: None,
            },
        );
    });

    let total_memory = number_field(payload, "computer", "TotalPhysicalMemory")
        .or_else(|| number_field(payload, "os", "TotalVisibleMemorySize").map(|kb| kb * 1024));
    let free_memory = number_field(payload, "os", "FreePhysicalMemory").map(|kb| kb * 1024);
    if let Some(total_memory) = total_memory {
        let free = free_memory
            .map(format_bytes)
            .unwrap_or_else(|| "未知可用".to_string());
        push_item(
            items,
            PushItem {
                id: "hardware-memory",
                category: "hardware",
                name: "物理内存",
                value: format!("{} 总计 · {free} 可用", format_bytes(total_memory)),
                raw_value: None,
                source: "Win32_ComputerSystem + Win32_OperatingSystem",
                updated_at,
                status: EnvironmentItemStatus::Ok,
                tags: vec!["memory", "ram", "hardware", "内存"],
                metadata: None,
            },
        );
    }

    push_optional_field(
        items,
        "hardware-bios",
        "hardware",
        "BIOS 版本",
        payload,
        "bios",
        "SMBIOSBIOSVersion",
        "Win32_BIOS",
        updated_at,
        vec!["bios", "hardware"],
    );

    if let Some(baseboard) = payload.get("baseboard") {
        let manufacturer =
            child_field(baseboard, "Manufacturer").unwrap_or_else(|| "未知厂商".to_string());
        let product = child_field(baseboard, "Product").unwrap_or_else(|| "未知主板".to_string());
        push_item(
            items,
            PushItem {
                id: "hardware-baseboard",
                category: "hardware",
                name: "主板",
                value: format!("{manufacturer} · {product}"),
                raw_value: Some(object_raw(Some(baseboard))),
                source: "Win32_BaseBoard",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["baseboard", "motherboard", "hardware", "主板"],
                metadata: metadata_for_fields(
                    baseboard,
                    &[("manufacturer", "Manufacturer"), ("product", "Product"), ("version", "Version"), ("serial", "SerialNumber")],
                ),
            },
        );
    }

    for_each_arrayish(payload.get("memoryModules"), |module, index| {
        let bank = child_field(module, "BankLabel")
            .or_else(|| child_field(module, "DeviceLocator"))
            .unwrap_or_else(|| format!("内存条 {}", index + 1));
        let capacity = number_child(module, "Capacity")
            .map(format_bytes)
            .unwrap_or_else(|| "容量未知".to_string());
        let speed = child_field(module, "ConfiguredClockSpeed")
            .or_else(|| child_field(module, "Speed"))
            .unwrap_or_else(|| "频率未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("memory-module-{index}"),
                category: "hardware",
                name: &bank,
                value: format!("{capacity} · {speed} MHz"),
                raw_value: Some(object_raw(Some(module))),
                source: "Win32_PhysicalMemory",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["memory", "ram", "module", "内存"],
                metadata: metadata_for_fields(
                    module,
                    &[("manufacturer", "Manufacturer"), ("partNumber", "PartNumber"), ("serial", "SerialNumber")],
                ),
            },
        );
    });

    for_each_arrayish(payload.get("gpus"), |gpu, index| {
        let name = child_field(gpu, "Name").unwrap_or_else(|| "未知显卡".to_string());
        let driver = child_field(gpu, "DriverVersion").unwrap_or_else(|| "未知驱动".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("hardware-gpu-{index}"),
                category: "hardware",
                name: "显卡",
                value: format!("{name} · Driver {driver}"),
                raw_value: Some(object_raw(Some(gpu))),
                source: "Win32_VideoController",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["gpu", "display", "hardware", "显卡"],
                metadata: None,
            },
        );
    });

    for_each_arrayish(payload.get("monitors"), |monitor, index| {
        let name = child_field(monitor, "Name")
            .or_else(|| child_field(monitor, "MonitorType"))
            .unwrap_or_else(|| format!("显示器 {}", index + 1));
        let width = child_field(monitor, "ScreenWidth").unwrap_or_else(|| "?".to_string());
        let height = child_field(monitor, "ScreenHeight").unwrap_or_else(|| "?".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("display-monitor-{index}"),
                category: "hardware",
                name: &name,
                value: format!("{width} × {height}"),
                raw_value: Some(object_raw(Some(monitor))),
                source: "Win32_DesktopMonitor",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["display", "monitor", "hardware", "显示器"],
                metadata: metadata_for_fields(monitor, &[("status", "Status")]),
            },
        );
    });

    for_each_arrayish(payload.get("batteries"), |battery, index| {
        let name = child_field(battery, "Name").unwrap_or_else(|| format!("电池 {}", index + 1));
        let charge =
            child_field(battery, "EstimatedChargeRemaining").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("hardware-battery-{index}"),
                category: "hardware",
                name: &name,
                value: format!("剩余电量 {charge}%"),
                raw_value: Some(object_raw(Some(battery))),
                source: "Win32_Battery",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["battery", "power", "hardware"],
                metadata: metadata_for_fields(battery, &[("status", "BatteryStatus"), ("runtime", "EstimatedRunTime")]),
            },
        );
    });

    if let Some(power_plan) = string_value(payload.get("powerPlan")).filter(|value| !value.is_empty()) {
        push_item(
            items,
            PushItem {
                id: "hardware-power-plan",
                category: "hardware",
                name: "当前电源计划",
                value: power_plan.clone(),
                raw_value: Some(power_plan),
                source: "powercfg /GetActiveScheme",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["power", "hardware"],
                metadata: None,
            },
        );
    }

    if let Some(secure_boot) = string_value(payload.get("secureBoot")) {
        push_item(
            items,
            PushItem {
                id: "hardware-secure-boot",
                category: "hardware",
                name: "安全启动",
                value: if secure_boot.eq_ignore_ascii_case("true") {
                    "已启用".to_string()
                } else {
                    secure_boot
                },
                raw_value: None,
                source: "Confirm-SecureBootUEFI",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["secure boot", "uefi", "security", "hardware"],
                metadata: None,
            },
        );
    }

    if let Some(tpm) = payload.get("tpm") {
        let present = child_field(tpm, "TpmPresent").unwrap_or_else(|| "未知".to_string());
        let ready = child_field(tpm, "TpmReady").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: "hardware-tpm",
                category: "hardware",
                name: "TPM",
                value: format!("存在 {present} · 就绪 {ready}"),
                raw_value: Some(object_raw(Some(tpm))),
                source: "Get-Tpm",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["tpm", "security", "hardware"],
                metadata: metadata_for_fields(tpm, &[("enabled", "TpmEnabled"), ("manufacturer", "ManufacturerIdTxt")]),
            },
        );
    }

    for_each_arrayish(payload.get("pnpDevices"), |device, index| {
        let name = child_field(device, "FriendlyName")
            .or_else(|| child_field(device, "InstanceId"))
            .unwrap_or_else(|| format!("PnP 设备 {}", index + 1));
        let class = child_field(device, "Class").unwrap_or_else(|| "未知类别".to_string());
        let status = child_field(device, "Status").unwrap_or_else(|| "Unknown".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("pnp-device-{index}"),
                category: "hardware",
                name: &name,
                value: format!("{class} · {status}"),
                raw_value: Some(object_raw(Some(device))),
                source: "Get-PnpDevice",
                updated_at,
                status: if status.eq_ignore_ascii_case("OK") {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Info
                },
                tags: vec!["pnp", "device", "hardware"],
                metadata: metadata_for_fields(device, &[("class", "Class"), ("status", "Status"), ("instanceId", "InstanceId")]),
            },
        );
    });
}

fn populate_storage_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    for_each_arrayish(payload.get("logicalDisks"), |disk, index| {
        let device = child_field(disk, "DeviceID").unwrap_or_else(|| format!("Disk {index}"));
        let fs = child_field(disk, "FileSystem").unwrap_or_else(|| "未知文件系统".to_string());
        let total = number_child(disk, "Size");
        let free = number_child(disk, "FreeSpace");
        let status = match (total, free) {
            (Some(total), Some(free)) if total > 0 && free.saturating_mul(100) / total < 10 => {
                EnvironmentItemStatus::Warning
            }
            (Some(_), Some(_)) => EnvironmentItemStatus::Ok,
            _ => EnvironmentItemStatus::Info,
        };
        let size = match (total, free) {
            (Some(total), Some(free)) => {
                format!("{} 总计 · {} 可用", format_bytes(total), format_bytes(free))
            }
            _ => "容量未知".to_string(),
        };
        let mut metadata = BTreeMap::new();
        metadata.insert("path".to_string(), Value::String(format!("{device}\\")));
        push_item(
            items,
            PushItem {
                id: &format!("storage-logical-{index}"),
                category: "storage",
                name: &format!("{device} 卷"),
                value: format!("{fs} · {size}"),
                raw_value: Some(object_raw(Some(disk))),
                source: "Win32_LogicalDisk",
                updated_at,
                status,
                tags: vec!["disk", "volume", "storage", "磁盘"],
                metadata: Some(metadata),
            },
        );
    });

    for_each_arrayish(payload.get("physicalDisks"), |disk, index| {
        let model = child_field(disk, "Model").unwrap_or_else(|| "未知物理磁盘".to_string());
        let interface =
            child_field(disk, "InterfaceType").unwrap_or_else(|| "未知接口".to_string());
        let size = number_child(disk, "Size")
            .map(format_bytes)
            .unwrap_or_else(|| "容量未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("storage-physical-{index}"),
                category: "storage",
                name: "物理磁盘",
                value: format!("{model} · {interface} · {size}"),
                raw_value: Some(object_raw(Some(disk))),
                source: "Win32_DiskDrive",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["disk", "drive", "storage", "磁盘"],
                metadata: None,
            },
        );
    });

    for_each_arrayish(payload.get("partitions"), |partition, index| {
        let disk = child_field(partition, "DiskNumber").unwrap_or_else(|| "?".to_string());
        let number = child_field(partition, "PartitionNumber").unwrap_or_else(|| "?".to_string());
        let size = number_child(partition, "Size")
            .map(format_bytes)
            .unwrap_or_else(|| "容量未知".to_string());
        let drive = child_field(partition, "DriveLetter")
            .filter(|value| !value.is_empty())
            .map(|value| format!(" · {value}:"))
            .unwrap_or_default();
        push_item(
            items,
            PushItem {
                id: &format!("storage-partition-{index}"),
                category: "storage",
                name: &format!("磁盘 {disk} 分区 {number}{drive}"),
                value: size,
                raw_value: Some(object_raw(Some(partition))),
                source: "Get-Partition",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["partition", "disk", "storage", "分区"],
                metadata: metadata_for_fields(
                    partition,
                    &[("type", "Type"), ("isBoot", "IsBoot"), ("isSystem", "IsSystem"), ("isActive", "IsActive")],
                ),
            },
        );
    });

    for_each_arrayish(payload.get("volumes"), |volume, index| {
        let drive = child_field(volume, "DriveLetter")
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("卷 {}", index + 1));
        let fs = child_field(volume, "FileSystem").unwrap_or_else(|| "未知文件系统".to_string());
        let total = number_child(volume, "Size");
        let remaining = number_child(volume, "SizeRemaining");
        let value = match (total, remaining) {
            (Some(total), Some(remaining)) => {
                format!("{} 总计 · {} 可用", format_bytes(total), format_bytes(remaining))
            }
            _ => "容量未知".to_string(),
        };
        push_item(
            items,
            PushItem {
                id: &format!("volume-{index}"),
                category: "storage",
                name: &format!("{drive}: 卷"),
                value: format!("{fs} · {value}"),
                raw_value: Some(object_raw(Some(volume))),
                source: "Get-Volume",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["volume", "storage", "filesystem"],
                metadata: metadata_for_fields(
                    volume,
                    &[("label", "FileSystemLabel"), ("health", "HealthStatus"), ("operational", "OperationalStatus"), ("driveType", "DriveType")],
                ),
            },
        );
    });

    for_each_arrayish(payload.get("bitlocker"), |volume, index| {
        let mount = child_field(volume, "MountPoint").unwrap_or_else(|| format!("卷 {}", index + 1));
        let status = child_field(volume, "ProtectionStatus").unwrap_or_else(|| "未知".to_string());
        let percent =
            child_field(volume, "EncryptionPercentage").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("bitlocker-{index}"),
                category: "storage",
                name: &format!("BitLocker · {mount}"),
                value: format!("保护 {status} · 加密 {percent}%"),
                raw_value: Some(object_raw(Some(volume))),
                source: "Get-BitLockerVolume",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["bitlocker", "encryption", "storage", "security"],
                metadata: metadata_for_fields(volume, &[("volumeStatus", "VolumeStatus"), ("method", "EncryptionMethod")]),
            },
        );
    });
}

fn populate_network_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    for_each_arrayish(payload.get("networkConfigs"), |adapter, index| {
        let description =
            child_field(adapter, "Description").unwrap_or_else(|| "网络适配器".to_string());
        let ips = string_array_child(adapter, "IPAddress").join(", ");
        let gateway = string_array_child(adapter, "DefaultIPGateway").join(", ");
        let dns = string_array_child(adapter, "DNSServerSearchOrder").join(", ");
        let dhcp = child_field(adapter, "DHCPEnabled").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("network-config-{index}"),
                category: "network",
                name: &description,
                value: format!(
                    "{} · 网关 {} · DHCP {}",
                    empty_as_unknown(&ips),
                    empty_as_unknown(&gateway),
                    dhcp
                ),
                raw_value: Some(format!("DNS={}", empty_as_unknown(&dns))),
                source: "Win32_NetworkAdapterConfiguration",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["network", "ip", "dns", "网卡"],
                metadata: None,
            },
        );
    });

    for_each_arrayish(payload.get("netAdapters"), |adapter, index| {
        let raw_name = child_field(adapter, "Name").unwrap_or_else(|| format!("Adapter {index}"));
        let description = child_field(adapter, "InterfaceDescription");
        let name = if looks_garbled(&raw_name) {
            description.clone().unwrap_or(raw_name)
        } else {
            raw_name
        };
        let status = child_field(adapter, "Status").unwrap_or_else(|| "Unknown".to_string());
        let link = child_field(adapter, "LinkSpeed").unwrap_or_else(|| "未知速率".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("network-adapter-{index}"),
                category: "network",
                name: &format!("链路 · {name}"),
                value: format!("{status} · {link}"),
                raw_value: Some(object_raw(Some(adapter))),
                source: "Get-NetAdapter",
                updated_at,
                status: if status.eq_ignore_ascii_case("up") {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Info
                },
                tags: vec!["network", "adapter", "link"],
                metadata: metadata_for_fields(adapter, &[("description", "InterfaceDescription"), ("mac", "MacAddress"), ("index", "InterfaceIndex")]),
            },
        );
    });

    for_each_arrayish(payload.get("routes"), |route, index| {
        let destination =
            child_field(route, "DestinationPrefix").unwrap_or_else(|| "未知目标".to_string());
        let next_hop = child_field(route, "NextHop").unwrap_or_else(|| "未知下一跳".to_string());
        let alias = child_field(route, "InterfaceAlias").unwrap_or_else(|| "未知接口".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("route-{index}"),
                category: "network",
                name: &format!("路由 · {destination}"),
                value: format!("{next_hop} · {alias}"),
                raw_value: Some(object_raw(Some(route))),
                source: "Get-NetRoute",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["route", "network", "gateway"],
                metadata: metadata_for_fields(route, &[("metric", "RouteMetric"), ("family", "AddressFamily")]),
            },
        );
    });

    for_each_arrayish(payload.get("tcpListeners"), |port, index| {
        let address = child_field(port, "LocalAddress").unwrap_or_else(|| "*".to_string());
        let local_port = child_field(port, "LocalPort").unwrap_or_else(|| "?".to_string());
        let pid = child_field(port, "OwningProcess").unwrap_or_else(|| "?".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("port-tcp-{index}"),
                category: "network",
                name: &format!("TCP {address}:{local_port}"),
                value: format!("监听中 · PID {pid}"),
                raw_value: Some(object_raw(Some(port))),
                source: "Get-NetTCPConnection",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["tcp", "port", "listen", "network"],
                metadata: metadata_for_fields(port, &[("processId", "OwningProcess"), ("state", "State")]),
            },
        );
    });

    for_each_arrayish(payload.get("udpListeners"), |port, index| {
        let address = child_field(port, "LocalAddress").unwrap_or_else(|| "*".to_string());
        let local_port = child_field(port, "LocalPort").unwrap_or_else(|| "?".to_string());
        let pid = child_field(port, "OwningProcess").unwrap_or_else(|| "?".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("port-udp-{index}"),
                category: "network",
                name: &format!("UDP {address}:{local_port}"),
                value: format!("监听中 · PID {pid}"),
                raw_value: Some(object_raw(Some(port))),
                source: "Get-NetUDPEndpoint",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["udp", "port", "listen", "network"],
                metadata: metadata_for_fields(port, &[("processId", "OwningProcess")]),
            },
        );
    });

    if let Some(proxy) = payload.get("proxy") {
        let enabled = child_field(proxy, "ProxyEnable").unwrap_or_else(|| "0".to_string());
        let server = child_field(proxy, "ProxyServer").unwrap_or_else(|| "未配置".to_string());
        push_item(
            items,
            PushItem {
                id: "proxy-user",
                category: "network",
                name: "用户代理设置",
                value: format!("启用 {enabled} · {server}"),
                raw_value: Some(object_raw(Some(proxy))),
                source: "HKCU Internet Settings",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["proxy", "network", "internet"],
                metadata: metadata_for_fields(proxy, &[("autoConfigUrl", "AutoConfigURL")]),
            },
        );
    }

    if let Some(hosts) = payload.get("hostsFile") {
        let path = child_field(hosts, "Path").unwrap_or_else(|| "hosts".to_string());
        let exists = child_field(hosts, "Exists").unwrap_or_else(|| "false".to_string());
        let mut metadata = metadata_for_fields(
            hosts,
            &[("path", "Path"), ("exists", "Exists"), ("size", "Length"), ("lastWriteTime", "LastWriteTime")],
        )
        .unwrap_or_default();
        metadata.insert("path".to_string(), Value::String(path.clone()));
        push_item(
            items,
            PushItem {
                id: "proxy-hosts-file",
                category: "network",
                name: "hosts 文件",
                value: format!("{path} · 存在 {exists}"),
                raw_value: Some(object_raw(Some(hosts))),
                source: "SystemRoot hosts",
                updated_at,
                status: if exists.eq_ignore_ascii_case("true") {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Warning
                },
                tags: vec!["hosts", "dns", "network"],
                metadata: Some(metadata),
            },
        );
    }
}

fn populate_process_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let count = number_value(payload.get("processCount")).unwrap_or(0);
    push_item(
        items,
        PushItem {
            id: "process-count",
            category: "process",
            name: "运行进程数",
            value: format!("{count} 个进程"),
            raw_value: None,
            source: "Get-Process",
            updated_at,
            status: EnvironmentItemStatus::Info,
            tags: vec!["process", "进程"],
            metadata: None,
        },
    );

    for_each_arrayish(payload.get("processes"), |process, index| {
        let name = child_field(process, "ProcessName").unwrap_or_else(|| "process".to_string());
        let pid = child_field(process, "Id").unwrap_or_else(|| "?".to_string());
        let memory = number_child(process, "WorkingSet64")
            .map(format_bytes)
            .unwrap_or_else(|| "未知内存".to_string());
        let path = child_field(process, "Path");
        push_item(
            items,
            PushItem {
                id: &format!("process-top-{index}"),
                category: "process",
                name: &format!("{name}.exe"),
                value: format!("PID {pid} · {memory}"),
                raw_value: path.clone(),
                source: "Get-Process",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["process", "memory", "进程"],
                metadata: path
                    .and_then(path_metadata)
                    .or_else(|| metadata_for_fields(process, &[("processId", "Id"), ("window", "MainWindowTitle")])),
            },
        );
    });
}

fn populate_service_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let total = number_value(payload.get("serviceCount")).unwrap_or(0);
    let running = number_value(payload.get("runningServiceCount")).unwrap_or(0);
    push_item(
        items,
        PushItem {
            id: "service-count",
            category: "service",
            name: "服务数量",
            value: format!("{total} 个服务 · {running} 个正在运行"),
            raw_value: None,
            source: "Win32_Service",
            updated_at,
            status: EnvironmentItemStatus::Info,
            tags: vec!["service", "服务"],
            metadata: None,
        },
    );

    for_each_arrayish(payload.get("services"), |service, index| {
        let display = child_field(service, "DisplayName")
            .or_else(|| child_field(service, "Name"))
            .unwrap_or_else(|| "Windows 服务".to_string());
        let state = child_field(service, "State").unwrap_or_else(|| "Unknown".to_string());
        let mode = child_field(service, "StartMode").unwrap_or_else(|| "Unknown".to_string());
        let path = child_field(service, "PathName");
        push_item(
            items,
            PushItem {
                id: &format!("service-{index}"),
                category: "service",
                name: &display,
                value: format!("{state} · {mode}"),
                raw_value: path.clone(),
                source: "Win32_Service",
                updated_at,
                status: if state == "Running" {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Info
                },
                tags: vec!["service", "windows", "服务"],
                metadata: path.and_then(executable_path_metadata),
            },
        );
    });
}

fn populate_driver_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let total = number_value(payload.get("driverCount")).unwrap_or(0);
    let running = number_value(payload.get("runningDriverCount")).unwrap_or(0);
    push_item(
        items,
        PushItem {
            id: "driver-count",
            category: "driver",
            name: "系统驱动数量",
            value: format!("{total} 个驱动 · {running} 个正在运行"),
            raw_value: None,
            source: "Win32_SystemDriver",
            updated_at,
            status: EnvironmentItemStatus::Info,
            tags: vec!["driver", "驱动"],
            metadata: None,
        },
    );

    for_each_arrayish(payload.get("drivers"), |driver, index| {
        let display = child_field(driver, "DisplayName")
            .or_else(|| child_field(driver, "Name"))
            .unwrap_or_else(|| "系统驱动".to_string());
        let state = child_field(driver, "State").unwrap_or_else(|| "Unknown".to_string());
        let mode = child_field(driver, "StartMode").unwrap_or_else(|| "Unknown".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("driver-{index}"),
                category: "driver",
                name: &display,
                value: format!("{state} · {mode}"),
                raw_value: child_field(driver, "PathName"),
                source: "Win32_SystemDriver",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["driver", "windows", "驱动"],
                metadata: None,
            },
        );
    });
}

fn populate_environment_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    push_env_map(payload.get("envMachine"), "Machine", items, updated_at);
    push_env_map(payload.get("envUser"), "User", items, updated_at);
}

fn populate_path_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let machine_path = string_value(payload.get("pathMachine")).unwrap_or_default();
    let user_path = string_value(payload.get("pathUser")).unwrap_or_default();
    let machine_entries = split_path_entries(&machine_path);
    let user_entries = split_path_entries(&user_path);
    let total = machine_entries.len() + user_entries.len();

    push_item(
        items,
        PushItem {
            id: "path-combined",
            category: "path",
            name: "PATH",
            value: format!("{total} 个条目 · Machine + User"),
            raw_value: Some(format!("Machine={machine_path}\nUser={user_path}")),
            source: "Machine + User",
            updated_at,
            status: if total == 0 {
                EnvironmentItemStatus::Empty
            } else {
                EnvironmentItemStatus::Ok
            },
            tags: vec!["path", "PATH", "environment", "变量"],
            metadata: None,
        },
    );

    for (source, entries) in [("Machine PATH", machine_entries), ("User PATH", user_entries)] {
        for (index, entry) in entries.iter().enumerate() {
            let exists = Path::new(entry).exists();
            push_item(
                items,
                PushItem {
                    id: &format!("path-{}-{index}", source.to_lowercase().replace(' ', "-")),
                    category: "path",
                    name: &format!("PATH · {}", index + 1),
                    value: entry.to_string(),
                    raw_value: Some(entry.to_string()),
                    source,
                    updated_at,
                    status: if exists {
                        EnvironmentItemStatus::Ok
                    } else {
                        EnvironmentItemStatus::Warning
                    },
                    tags: vec!["path", "PATH", "environment"],
                    metadata: path_metadata(entry.to_string()),
                },
            );
        }
    }
}

fn populate_software_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    for_each_arrayish(payload.get("runtimeTools"), |tool, index| {
        let name = child_field(tool, "Name").unwrap_or_else(|| format!("runtime-{index}"));
        let found = tool
            .get("Found")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| !string_array_child(tool, "Paths").is_empty());
        let paths = string_array_child(tool, "Paths");
        let value = if paths.is_empty() {
            "未找到".to_string()
        } else {
            paths.join(", ")
        };
        let mut metadata = BTreeMap::new();
        metadata.insert(
            "paths".to_string(),
            Value::Array(paths.iter().cloned().map(Value::String).collect()),
        );
        metadata.insert("exists".to_string(), Value::Bool(found));
        push_item(
            items,
            PushItem {
                id: &format!("runtime-{name}"),
                category: "software",
                name: &name,
                value,
                raw_value: Some(object_raw(Some(tool))),
                source: "where.exe",
                updated_at,
                status: if found {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Empty
                },
                tags: vec!["runtime", "cli", "developer", "软件"],
                metadata: Some(metadata),
            },
        );
    });

    for_each_arrayish(payload.get("shellProfiles"), |profile, index| {
        let scope = child_field(profile, "Scope").unwrap_or_else(|| format!("Profile {index}"));
        let path = child_field(profile, "Path").unwrap_or_default();
        let exists = child_field(profile, "Exists").unwrap_or_else(|| "false".to_string());
        let mut metadata = path_metadata(path.clone()).unwrap_or_default();
        metadata.insert("scope".to_string(), Value::String(scope.clone()));
        metadata.insert(
            "exists".to_string(),
            Value::Bool(exists.eq_ignore_ascii_case("true")),
        );
        push_item(
            items,
            PushItem {
                id: &format!("shell-profile-{index}"),
                category: "software",
                name: &format!("PowerShell Profile · {scope}"),
                value: if path.is_empty() { "未配置".to_string() } else { path.clone() },
                raw_value: Some(object_raw(Some(profile))),
                source: "$PROFILE",
                updated_at,
                status: if exists.eq_ignore_ascii_case("true") {
                    EnvironmentItemStatus::Ok
                } else {
                    EnvironmentItemStatus::Empty
                },
                tags: vec!["powershell", "profile", "shell"],
                metadata: Some(metadata),
            },
        );
    });

    for_each_arrayish(payload.get("installedApps"), |app, index| {
        let name = child_field(app, "DisplayName").unwrap_or_else(|| format!("应用 {}", index + 1));
        let version = child_field(app, "DisplayVersion").unwrap_or_else(|| "版本未知".to_string());
        let publisher = child_field(app, "Publisher").unwrap_or_else(|| "发布者未知".to_string());
        let install_location = child_field(app, "InstallLocation");
        let metadata = install_location
            .clone()
            .and_then(path_metadata)
            .or_else(|| metadata_for_fields(app, &[("publisher", "Publisher"), ("version", "DisplayVersion"), ("scope", "Scope"), ("installDate", "InstallDate")]));
        push_item(
            items,
            PushItem {
                id: &format!("software-app-{index}"),
                category: "software",
                name: &name,
                value: format!("{version} · {publisher}"),
                raw_value: Some(object_raw(Some(app))),
                source: "Uninstall registry allowlist",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["software", "installed", "app", "registry"],
                metadata,
            },
        );
    });
}

fn populate_automation_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    for_each_arrayish(payload.get("startupItems"), |startup, index| {
        let name = child_field(startup, "Name").unwrap_or_else(|| format!("启动项 {}", index + 1));
        let command = child_field(startup, "Command").unwrap_or_default();
        let source = child_field(startup, "Source").unwrap_or_else(|| "Startup".to_string());
        let metadata = executable_path_metadata(command.clone())
            .or_else(|| metadata_for_fields(startup, &[("scope", "Scope"), ("source", "Source"), ("command", "Command")]));
        push_item(
            items,
            PushItem {
                id: &format!("startup-{index}"),
                category: "automation",
                name: &name,
                value: command.clone(),
                raw_value: Some(object_raw(Some(startup))),
                source: "Run keys + Startup folders",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["startup", "run", "automation"],
                metadata: metadata.or_else(|| {
                    let mut map = BTreeMap::new();
                    map.insert("source".to_string(), Value::String(source));
                    Some(map)
                }),
            },
        );
    });

    for_each_arrayish(payload.get("scheduledTasks"), |task, index| {
        let name = child_field(task, "TaskName").unwrap_or_else(|| format!("计划任务 {}", index + 1));
        let path = child_field(task, "TaskPath").unwrap_or_else(|| "\\".to_string());
        let state = child_field(task, "State").unwrap_or_else(|| "Unknown".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("task-{index}"),
                category: "automation",
                name: &format!("{path}{name}"),
                value: state.clone(),
                raw_value: Some(object_raw(Some(task))),
                source: "Get-ScheduledTask",
                updated_at,
                status: if state.eq_ignore_ascii_case("Disabled") {
                    EnvironmentItemStatus::Info
                } else {
                    EnvironmentItemStatus::Ok
                },
                tags: vec!["scheduled task", "automation", "task"],
                metadata: metadata_for_fields(task, &[("author", "Author"), ("description", "Description")]),
            },
        );
    });
}

fn populate_security_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    if let Some(defender) = payload.get("defender") {
        let antivirus = child_field(defender, "AntivirusEnabled").unwrap_or_else(|| "未知".to_string());
        let realtime =
            child_field(defender, "RealTimeProtectionEnabled").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: "defender-status",
                category: "security",
                name: "Microsoft Defender",
                value: format!("防病毒 {antivirus} · 实时保护 {realtime}"),
                raw_value: Some(object_raw(Some(defender))),
                source: "Get-MpComputerStatus",
                updated_at,
                status: if antivirus.eq_ignore_ascii_case("false")
                    || realtime.eq_ignore_ascii_case("false")
                {
                    EnvironmentItemStatus::Warning
                } else {
                    EnvironmentItemStatus::Info
                },
                tags: vec!["defender", "security", "antivirus"],
                metadata: metadata_for_fields(
                    defender,
                    &[("signatureUpdated", "AntivirusSignatureLastUpdated"), ("quickScanEnd", "QuickScanEndTime"), ("fullScanEnd", "FullScanEndTime")],
                ),
            },
        );
    }

    for_each_arrayish(payload.get("firewallProfiles"), |profile, index| {
        let name = child_field(profile, "Name").unwrap_or_else(|| format!("防火墙配置 {}", index + 1));
        let enabled = child_field(profile, "Enabled").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("firewall-profile-{index}"),
                category: "security",
                name: &format!("防火墙 · {name}"),
                value: format!("启用 {enabled}"),
                raw_value: Some(object_raw(Some(profile))),
                source: "Get-NetFirewallProfile",
                updated_at,
                status: if enabled.eq_ignore_ascii_case("false") {
                    EnvironmentItemStatus::Warning
                } else {
                    EnvironmentItemStatus::Ok
                },
                tags: vec!["firewall", "security", "network"],
                metadata: metadata_for_fields(profile, &[("inbound", "DefaultInboundAction"), ("outbound", "DefaultOutboundAction"), ("notify", "NotifyOnListen")]),
            },
        );
    });

    for_each_arrayish(payload.get("certificates"), |certificate, index| {
        let subject =
            child_field(certificate, "Subject").unwrap_or_else(|| format!("证书 {}", index + 1));
        let store = child_field(certificate, "Store").unwrap_or_else(|| "Cert:\\".to_string());
        let expires = child_field(certificate, "NotAfter").unwrap_or_else(|| "未知到期时间".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("certificate-{index}"),
                category: "security",
                name: &subject,
                value: format!("{store} · 到期 {expires}"),
                raw_value: Some(object_raw(Some(certificate))),
                source: "Cert: provider",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["certificate", "security", "cert"],
                metadata: metadata_for_fields(certificate, &[("issuer", "Issuer"), ("thumbprint", "Thumbprint"), ("store", "Store")]),
            },
        );
    });

    for_each_arrayish(payload.get("eventLogs"), |log, index| {
        let name = child_field(log, "LogName").unwrap_or_else(|| format!("事件日志 {}", index + 1));
        let count = child_field(log, "RecordCount").unwrap_or_else(|| "未知".to_string());
        let enabled = child_field(log, "IsEnabled").unwrap_or_else(|| "未知".to_string());
        push_item(
            items,
            PushItem {
                id: &format!("eventlog-{index}"),
                category: "security",
                name: &name,
                value: format!("{count} 条记录 · 启用 {enabled}"),
                raw_value: Some(object_raw(Some(log))),
                source: "Get-WinEvent -ListLog",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["event log", "logs", "security"],
                metadata: metadata_for_fields(log, &[("maxSize", "MaximumSizeInBytes"), ("lastWriteTime", "LastWriteTime")]),
            },
        );
    });
}

fn populate_registry_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    if let Some(current_version) = payload.pointer("/registry/currentVersion") {
        let product =
            child_field(current_version, "ProductName").unwrap_or_else(|| "Windows".to_string());
        let display =
            child_field(current_version, "DisplayVersion").unwrap_or_else(|| "未知版本".to_string());
        let build =
            child_field(current_version, "CurrentBuild").unwrap_or_else(|| "未知构建".to_string());
        push_item(
            items,
            PushItem {
                id: "registry-current-version",
                category: "registry",
                name: "Windows CurrentVersion",
                value: format!("{product} · {display} · {build}"),
                raw_value: Some(object_raw(Some(current_version))),
                source: "HKLM allowlist",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["registry", "windows", "version", "注册表"],
                metadata: None,
            },
        );
    }

    if let Some(powershell) = payload.pointer("/registry/powershell") {
        push_item(
            items,
            PushItem {
                id: "registry-powershell",
                category: "registry",
                name: "PowerShell 引擎",
                value: child_field(powershell, "PowerShellVersion")
                    .unwrap_or_else(|| "未知版本".to_string()),
                raw_value: Some(object_raw(Some(powershell))),
                source: "HKLM allowlist",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["registry", "powershell", "注册表"],
                metadata: None,
            },
        );
    }
}

fn populate_app_items(
    data_dir: &Path,
    log_dir: &Path,
    items: &mut Vec<EnvironmentItem>,
    updated_at: &str,
) {
    let app_items = [
        (
            "app-data-dir",
            "Toolbag 数据目录",
            data_dir.display().to_string(),
            "Tauri app_data_dir",
        ),
        (
            "app-log-dir",
            "Toolbag 日志目录",
            log_dir.display().to_string(),
            "Tauri app_log_dir",
        ),
    ];

    for (id, name, path, source) in app_items {
        push_item(
            items,
            PushItem {
                id,
                category: "app",
                name,
                value: path.clone(),
                raw_value: Some(path.clone()),
                source,
                updated_at,
                status: EnvironmentItemStatus::Ok,
                tags: vec!["toolbag", "app", "directory"],
                metadata: path_metadata(path),
            },
        );
    }

    if let Ok(exe) = std::env::current_exe() {
        let path = exe.display().to_string();
        push_item(
            items,
            PushItem {
                id: "app-current-exe",
                category: "app",
                name: "当前可执行文件",
                value: path.clone(),
                raw_value: Some(path.clone()),
                source: "std::env::current_exe",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["toolbag", "app", "exe"],
                metadata: path_metadata(path),
            },
        );
    }
}

fn populate_permission_items(payload: &Value, items: &mut Vec<EnvironmentItem>, updated_at: &str) {
    let is_admin = payload
        .pointer("/permissions/isAdmin")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    push_item(
        items,
        PushItem {
            id: "permission-elevation",
            category: "permission",
            name: "运行权限",
            value: if is_admin {
                "管理员权限 · 只读扫描".to_string()
            } else {
                "普通权限 · 只读扫描".to_string()
            },
            raw_value: Some("Toolbag 环境概览不会写入系统配置，也不会进行遥测上报。".to_string()),
            source: "Windows identity",
            updated_at,
            status: if is_admin {
                EnvironmentItemStatus::Warning
            } else {
                EnvironmentItemStatus::Ok
            },
            tags: vec!["permission", "readonly", "安全"],
            metadata: None,
        },
    );

    if let Some(policy) = payload
        .pointer("/permissions/executionPolicy")
        .and_then(|value| string_value(Some(value)))
    {
        push_item(
            items,
            PushItem {
                id: "permission-execution-policy",
                category: "permission",
                name: "PowerShell 执行策略",
                value: policy,
                raw_value: None,
                source: "Get-ExecutionPolicy",
                updated_at,
                status: EnvironmentItemStatus::Info,
                tags: vec!["powershell", "policy", "安全"],
                metadata: None,
            },
        );
    }
}

fn build_summary(payload: &Value, items: &[EnvironmentItem]) -> Vec<EnvironmentSummaryMetric> {
    let os_value = field(payload, "os", "Caption").unwrap_or_else(|| "Windows".to_string());
    let os_detail = field(payload, "os", "BuildNumber")
        .map(|build| format!("Build {build}"))
        .unwrap_or_else(|| "构建未知".to_string());
    let cpu_value = payload
        .get("cpus")
        .and_then(first_arrayish)
        .and_then(|cpu| child_field(cpu, "Name"))
        .unwrap_or_else(|| "CPU 未知".to_string());
    let memory_value = number_field(payload, "computer", "TotalPhysicalMemory")
        .map(format_bytes)
        .unwrap_or_else(|| "未知".to_string());
    let disk_count = count_category(items, "storage");
    let network_count = count_category(items, "network");
    let process_count = number_value(payload.get("processCount")).unwrap_or(0);
    let service_count = number_value(payload.get("serviceCount")).unwrap_or(0);
    let env_count = count_category(items, "environment");
    let software_count = count_category(items, "software");
    let automation_count = count_category(items, "automation");
    let security_count = count_category(items, "security");
    let is_admin = payload
        .pointer("/permissions/isAdmin")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    vec![
        metric("os", "OS", os_value, os_detail, EnvironmentItemStatus::Ok),
        metric("cpu", "CPU", cpu_value, "CIM 采集".to_string(), EnvironmentItemStatus::Ok),
        metric(
            "memory",
            "Memory",
            memory_value,
            "物理内存".to_string(),
            EnvironmentItemStatus::Ok,
        ),
        metric(
            "disk",
            "Disk",
            format!("{disk_count} 项"),
            "逻辑卷 + 物理盘".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "network",
            "Network",
            format!("{network_count} 项"),
            "适配器 + IP".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "process",
            "Processes",
            process_count.to_string(),
            "运行中".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "service",
            "Services",
            service_count.to_string(),
            "服务总数".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "permission",
            "Permission",
            if is_admin { "管理员权限" } else { "普通权限" }.to_string(),
            "本地只读".to_string(),
            if is_admin {
                EnvironmentItemStatus::Warning
            } else {
                EnvironmentItemStatus::Ok
            },
        ),
        metric(
            "environment",
            "Variables",
            env_count.to_string(),
            "Machine + User".to_string(),
            EnvironmentItemStatus::Ok,
        ),
        metric(
            "software",
            "Software",
            format!("{software_count} 项"),
            "应用 + 运行时".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "automation",
            "Startup",
            format!("{automation_count} 项"),
            "启动项 + 计划任务".to_string(),
            EnvironmentItemStatus::Info,
        ),
        metric(
            "security",
            "Security",
            format!("{security_count} 项"),
            "Defender + 防火墙".to_string(),
            category_status(
                &items
                    .iter()
                    .filter(|item| item.category == "security")
                    .collect::<Vec<_>>(),
            ),
        ),
    ]
}

#[derive(Clone, Copy)]
struct CategoryDefinition {
    id: &'static str,
    parent_id: Option<&'static str>,
    label: &'static str,
    description: &'static str,
    #[allow(dead_code)]
    prefix: &'static str,
}

fn category_definitions() -> &'static [CategoryDefinition] {
    &[
        CategoryDefinition { id: "system", parent_id: None, label: "系统概况", description: "Windows 版本、区域时间与计算机身份", prefix: "" },
        CategoryDefinition { id: "system.os", parent_id: Some("system"), label: "操作系统", description: "版本、构建、启动与安装时间", prefix: "system-" },
        CategoryDefinition { id: "system.identity", parent_id: Some("system"), label: "计算机身份", description: "主机名、域、型号与注册用户", prefix: "system-computer" },
        CategoryDefinition { id: "hardware", parent_id: None, label: "硬件资源", description: "CPU、内存、主板、显卡与外设", prefix: "" },
        CategoryDefinition { id: "hardware.cpu", parent_id: Some("hardware"), label: "CPU", description: "处理器、核心与线程", prefix: "hardware-cpu" },
        CategoryDefinition { id: "hardware.memory", parent_id: Some("hardware"), label: "内存", description: "总量、可用量与内存条", prefix: "hardware-memory" },
        CategoryDefinition { id: "hardware.firmware", parent_id: Some("hardware"), label: "主板与固件", description: "BIOS、主板、TPM 与安全启动", prefix: "hardware-" },
        CategoryDefinition { id: "hardware.display", parent_id: Some("hardware"), label: "显示设备", description: "显卡与显示器", prefix: "display-" },
        CategoryDefinition { id: "hardware.pnp", parent_id: Some("hardware"), label: "即插即用设备", description: "可读取的 PnP 设备", prefix: "pnp-" },
        CategoryDefinition { id: "storage", parent_id: None, label: "存储", description: "物理盘、分区、卷与 BitLocker", prefix: "" },
        CategoryDefinition { id: "storage.volume", parent_id: Some("storage"), label: "卷与文件系统", description: "盘符、容量、剩余空间与文件系统", prefix: "storage-logical" },
        CategoryDefinition { id: "storage.physical", parent_id: Some("storage"), label: "物理盘与分区", description: "物理磁盘、接口、分区与容量", prefix: "storage-physical" },
        CategoryDefinition { id: "storage.bitlocker", parent_id: Some("storage"), label: "BitLocker", description: "卷加密与保护状态", prefix: "bitlocker-" },
        CategoryDefinition { id: "network", parent_id: None, label: "网络", description: "适配器、IP、DNS、路由、端口与代理", prefix: "" },
        CategoryDefinition { id: "network.adapter", parent_id: Some("network"), label: "适配器", description: "链路、MAC、速率与状态", prefix: "network-adapter" },
        CategoryDefinition { id: "network.config", parent_id: Some("network"), label: "IP 配置", description: "IP、网关、DHCP 与 DNS", prefix: "network-config" },
        CategoryDefinition { id: "network.route", parent_id: Some("network"), label: "路由", description: "IPv4/IPv6 路由表", prefix: "route-" },
        CategoryDefinition { id: "network.port", parent_id: Some("network"), label: "监听端口", description: "TCP/UDP 本地监听端口", prefix: "port-" },
        CategoryDefinition { id: "network.proxy", parent_id: Some("network"), label: "代理与 hosts", description: "系统代理与 hosts 文件", prefix: "proxy-" },
        CategoryDefinition { id: "process", parent_id: None, label: "进程", description: "当前运行进程与资源占用", prefix: "" },
        CategoryDefinition { id: "process.running", parent_id: Some("process"), label: "运行中", description: "进程 ID、内存与路径", prefix: "process-" },
        CategoryDefinition { id: "service", parent_id: None, label: "服务", description: "Windows 服务状态与启动模式", prefix: "" },
        CategoryDefinition { id: "service.windows", parent_id: Some("service"), label: "Windows 服务", description: "服务状态、启动模式与命令行", prefix: "service-" },
        CategoryDefinition { id: "driver", parent_id: None, label: "驱动", description: "系统驱动状态", prefix: "" },
        CategoryDefinition { id: "driver.system", parent_id: Some("driver"), label: "系统驱动", description: "驱动状态、启动模式与路径", prefix: "driver-" },
        CategoryDefinition { id: "environment", parent_id: None, label: "环境变量", description: "Machine 与 User 环境变量", prefix: "" },
        CategoryDefinition { id: "environment.machine", parent_id: Some("environment"), label: "Machine 变量", description: "系统级环境变量", prefix: "env-machine" },
        CategoryDefinition { id: "environment.user", parent_id: Some("environment"), label: "User 变量", description: "用户级环境变量", prefix: "env-user" },
        CategoryDefinition { id: "path", parent_id: None, label: "PATH", description: "PATH 条目拆分、来源与路径状态", prefix: "" },
        CategoryDefinition { id: "path.machine", parent_id: Some("path"), label: "Machine PATH", description: "系统 PATH 条目", prefix: "path-machine" },
        CategoryDefinition { id: "path.user", parent_id: Some("path"), label: "User PATH", description: "用户 PATH 条目", prefix: "path-user" },
        CategoryDefinition { id: "software", parent_id: None, label: "软件与运行时", description: "已安装应用、开发运行时与 Shell 配置", prefix: "" },
        CategoryDefinition { id: "software.installed", parent_id: Some("software"), label: "已安装应用", description: "卸载注册表中可读取的应用", prefix: "software-app" },
        CategoryDefinition { id: "software.runtime", parent_id: Some("software"), label: "开发运行时", description: "常见 CLI 和运行时路径", prefix: "runtime-" },
        CategoryDefinition { id: "software.shell", parent_id: Some("software"), label: "Shell 配置", description: "PowerShell 配置文件", prefix: "shell-" },
        CategoryDefinition { id: "automation", parent_id: None, label: "启动与任务", description: "启动项和计划任务", prefix: "" },
        CategoryDefinition { id: "automation.startup", parent_id: Some("automation"), label: "启动项", description: "Run 注册表和启动目录", prefix: "startup-" },
        CategoryDefinition { id: "automation.task", parent_id: Some("automation"), label: "计划任务", description: "Windows 计划任务状态", prefix: "task-" },
        CategoryDefinition { id: "security", parent_id: None, label: "安全状态", description: "Defender、防火墙、证书与系统保护", prefix: "" },
        CategoryDefinition { id: "security.defender", parent_id: Some("security"), label: "Defender", description: "Microsoft Defender 状态", prefix: "defender-" },
        CategoryDefinition { id: "security.firewall", parent_id: Some("security"), label: "防火墙", description: "Windows 防火墙配置文件", prefix: "firewall-" },
        CategoryDefinition { id: "security.certificate", parent_id: Some("security"), label: "证书", description: "本机和用户证书概览", prefix: "certificate-" },
        CategoryDefinition { id: "security.logs", parent_id: Some("security"), label: "事件日志", description: "Windows 事件日志概览", prefix: "eventlog-" },
        CategoryDefinition { id: "registry", parent_id: None, label: "注册表可读项", description: "安全白名单注册表信息", prefix: "" },
        CategoryDefinition { id: "registry.windows", parent_id: Some("registry"), label: "Windows 项", description: "CurrentVersion 等系统键", prefix: "registry-current" },
        CategoryDefinition { id: "registry.powershell", parent_id: Some("registry"), label: "PowerShell 项", description: "PowerShell 引擎注册表", prefix: "registry-powershell" },
        CategoryDefinition { id: "app", parent_id: None, label: "应用目录", description: "Toolbag 数据、日志与运行目录", prefix: "" },
        CategoryDefinition { id: "app.directory", parent_id: Some("app"), label: "Toolbag 目录", description: "数据、日志与可执行文件", prefix: "app-" },
        CategoryDefinition { id: "permission", parent_id: None, label: "日志与权限", description: "普通权限、日志目录与只读边界", prefix: "" },
        CategoryDefinition { id: "permission.boundary", parent_id: Some("permission"), label: "权限边界", description: "身份、执行策略与只读说明", prefix: "permission-" },
    ]
}

fn build_categories(items: &[EnvironmentItem]) -> Vec<EnvironmentCategory> {
    category_definitions()
        .iter()
        .map(|definition| {
            let category_items = items
                .iter()
                .filter(|item| {
                    if let Some(parent_id) = definition.parent_id {
                        item.category == parent_id
                            && item.subcategory.as_deref() == Some(definition.id)
                    } else {
                        item.category == definition.id
                    }
                })
                .collect::<Vec<_>>();
            EnvironmentCategory {
                id: definition.id.to_string(),
                parent_id: definition.parent_id.map(str::to_string),
                label: definition.label.to_string(),
                description: definition.description.to_string(),
                count: category_items.len(),
                status: category_status(&category_items),
            }
        })
        .collect()
}

fn push_env_map(
    value: Option<&Value>,
    source: &'static str,
    items: &mut Vec<EnvironmentItem>,
    updated_at: &str,
) {
    let Some(Value::Object(map)) = value else {
        return;
    };

    for (index, (name, env_value)) in map.iter().enumerate() {
        let value = string_value(Some(env_value)).unwrap_or_default();
        push_item(
            items,
            PushItem {
                id: &format!("env-{}-{index}", source.to_lowercase()),
                category: "environment",
                name,
                value: if value.is_empty() {
                    "空值".to_string()
                } else {
                    value.clone()
                },
                raw_value: Some(value.clone()),
                source,
                updated_at,
                status: if value.is_empty() {
                    EnvironmentItemStatus::Empty
                } else {
                    EnvironmentItemStatus::Ok
                },
                tags: vec!["environment", "变量", source],
                metadata: path_like_metadata(&value),
            },
        );
    }
}

fn push_optional_field(
    items: &mut Vec<EnvironmentItem>,
    id: &'static str,
    category: &'static str,
    name: &'static str,
    payload: &Value,
    object: &str,
    key: &str,
    source: &'static str,
    updated_at: &str,
    tags: Vec<&'static str>,
) {
    let value = field(payload, object, key);
    push_item(
        items,
        PushItem {
            id,
            category,
            name,
            value: value.unwrap_or_else(|| "未读取到".to_string()),
            raw_value: None,
            source,
            updated_at,
            status: EnvironmentItemStatus::Info,
            tags,
            metadata: None,
        },
    );
}

fn push_item(items: &mut Vec<EnvironmentItem>, input: PushItem<'_>) {
    let (subcategory, subcategory_label) = infer_subcategory(input.category, input.id);
    let details = input
        .metadata
        .as_ref()
        .map(details_from_metadata)
        .unwrap_or_default();
    items.push(EnvironmentItem {
        id: input.id.to_string(),
        category: input.category.to_string(),
        subcategory,
        subcategory_label,
        name: input.name.to_string(),
        value: input.value,
        raw_value: input.raw_value,
        source: input.source.to_string(),
        updated_at: input.updated_at.to_string(),
        status: input.status,
        tags: input.tags.into_iter().map(str::to_string).collect(),
        details,
        metadata: input.metadata,
    });
}

fn infer_subcategory(category: &str, id: &str) -> (Option<String>, Option<String>) {
    subcategory_definition_for_item(category, id)
        .map(|definition| {
            (
                Some(definition.id.to_string()),
                Some(definition.label.to_string()),
            )
        })
        .unwrap_or((None, None))
}

fn subcategory_definition_for_item(category: &str, id: &str) -> Option<&'static CategoryDefinition> {
    let subcategory_id = match category {
        "system"
            if id.starts_with("system-computer")
                || id.starts_with("system-domain")
                || id.starts_with("system-model")
                || id.starts_with("system-manufacturer")
                || id.starts_with("system-registered-user")
                || id.starts_with("system-user") =>
        {
            "system.identity"
        }
        "system" => "system.os",
        "hardware"
            if id.starts_with("hardware-cpu") =>
        {
            "hardware.cpu"
        }
        "hardware"
            if id.starts_with("hardware-memory") || id.starts_with("memory-module") =>
        {
            "hardware.memory"
        }
        "hardware"
            if id.starts_with("hardware-gpu") || id.starts_with("display-") =>
        {
            "hardware.display"
        }
        "hardware"
            if id.starts_with("pnp-") =>
        {
            "hardware.pnp"
        }
        "hardware" => "hardware.firmware",
        "storage"
            if id.starts_with("storage-logical") || id.starts_with("volume-") =>
        {
            "storage.volume"
        }
        "storage"
            if id.starts_with("bitlocker-") =>
        {
            "storage.bitlocker"
        }
        "storage" => "storage.physical",
        "network"
            if id.starts_with("network-adapter") =>
        {
            "network.adapter"
        }
        "network"
            if id.starts_with("network-config") =>
        {
            "network.config"
        }
        "network"
            if id.starts_with("route-") =>
        {
            "network.route"
        }
        "network"
            if id.starts_with("port-") =>
        {
            "network.port"
        }
        "network" => "network.proxy",
        "process" => "process.running",
        "service" => "service.windows",
        "driver" => "driver.system",
        "environment"
            if id.starts_with("env-machine") =>
        {
            "environment.machine"
        }
        "environment" => "environment.user",
        "path"
            if id.starts_with("path-machine") =>
        {
            "path.machine"
        }
        "path" => "path.user",
        "software"
            if id.starts_with("software-app") =>
        {
            "software.installed"
        }
        "software"
            if id.starts_with("runtime-") =>
        {
            "software.runtime"
        }
        "software" => "software.shell",
        "automation"
            if id.starts_with("startup-") =>
        {
            "automation.startup"
        }
        "automation" => "automation.task",
        "security"
            if id.starts_with("defender-") =>
        {
            "security.defender"
        }
        "security"
            if id.starts_with("firewall-") =>
        {
            "security.firewall"
        }
        "security"
            if id.starts_with("eventlog-") =>
        {
            "security.logs"
        }
        "security" => "security.certificate",
        "registry"
            if id.starts_with("registry-powershell") =>
        {
            "registry.powershell"
        }
        "registry" => "registry.windows",
        "app" => "app.directory",
        "permission" => "permission.boundary",
        _ => return None,
    };
    category_definitions()
        .iter()
        .find(|definition| definition.id == subcategory_id)
}

fn details_from_metadata(metadata: &BTreeMap<String, Value>) -> Vec<EnvironmentItemDetail> {
    metadata
        .iter()
        .filter_map(|(key, value)| {
            metadata_display_value(value).map(|display| EnvironmentItemDetail {
                label: metadata_label(key),
                value: display,
                source: None,
                kind: metadata_kind(key),
            })
        })
        .collect()
}

fn metadata_display_value(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(if *value { "是" } else { "否" }.to_string()),
        Value::Array(values) => {
            let display = values
                .iter()
                .filter_map(metadata_display_value)
                .collect::<Vec<_>>()
                .join(", ");
            (!display.is_empty()).then_some(display)
        }
        Value::Object(_) | Value::Null | Value::String(_) => None,
    }
}

fn metadata_label(key: &str) -> String {
    match key {
        "path" => "路径",
        "exists" => "存在",
        "source" => "来源",
        "scope" => "作用域",
        "count" => "数量",
        "size" => "大小",
        "status" => "状态",
        "publisher" => "发布者",
        "version" => "版本",
        "processId" => "进程 ID",
        "command" => "命令",
        "description" => "说明",
        _ => key,
    }
    .to_string()
}

fn metadata_kind(key: &str) -> Option<String> {
    match key {
        "path" => Some("path".to_string()),
        "count" | "size" | "processId" => Some("number".to_string()),
        "status" | "exists" => Some("status".to_string()),
        _ => None,
    }
}

fn split_path_entries(path: &str) -> Vec<String> {
    path.split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

fn category_status(items: &[&EnvironmentItem]) -> EnvironmentItemStatus {
    if items.is_empty() {
        return EnvironmentItemStatus::Empty;
    }
    if items.iter().any(|item| item.status == EnvironmentItemStatus::Error) {
        return EnvironmentItemStatus::Error;
    }
    if items
        .iter()
        .any(|item| item.status == EnvironmentItemStatus::Warning)
    {
        return EnvironmentItemStatus::Warning;
    }
    if items.iter().all(|item| item.status == EnvironmentItemStatus::Ok) {
        return EnvironmentItemStatus::Ok;
    }
    EnvironmentItemStatus::Info
}

fn field(payload: &Value, object: &str, key: &str) -> Option<String> {
    payload
        .get(object)
        .and_then(|value| value.get(key))
        .and_then(|value| string_value(Some(value)))
        .filter(|value| !value.is_empty())
}

fn number_field(payload: &Value, object: &str, key: &str) -> Option<u64> {
    payload
        .get(object)
        .and_then(|value| value.get(key))
        .and_then(|value| number_value(Some(value)))
}

fn child_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|value| string_value(Some(value)))
        .filter(|value| !value.is_empty())
}

fn number_child(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|value| number_value(Some(value)))
}

fn string_value(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => Some(normalize_display_string(value)),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Array(values) => Some(
            values
                .iter()
                .filter_map(|value| string_value(Some(value)))
                .collect::<Vec<_>>()
                .join(", "),
        ),
        Value::Null => None,
        Value::Object(_) => None,
    }
}

fn normalize_display_string(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(date) = normalize_windows_json_date(trimmed) {
        return date;
    }
    if trimmed.contains('\u{fffd}') {
        return trimmed
            .replace('\u{fffd}', "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
    }
    trimmed.to_string()
}

fn normalize_windows_json_date(value: &str) -> Option<String> {
    let inner = value
        .strip_prefix("/Date(")
        .and_then(|value| value.strip_suffix(")/"))?;
    let millis_text = inner
        .split(['+', '-'])
        .next()
        .filter(|value| !value.is_empty())?;
    let millis = millis_text.parse::<i64>().ok()?;
    OffsetDateTime::from_unix_timestamp(millis / 1000)
        .ok()
        .and_then(|date| date.format(&Rfc3339).ok())
}

fn number_value(value: Option<&Value>) -> Option<u64> {
    match value? {
        Value::Number(number) => number.as_u64().or_else(|| number.as_f64().map(|value| value as u64)),
        Value::String(value) => value.parse::<u64>().ok(),
        _ => None,
    }
}

fn string_array_child(value: &Value, key: &str) -> Vec<String> {
    match value.get(key) {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| string_value(Some(value)))
            .collect(),
        Some(other) => string_value(Some(other)).into_iter().collect(),
        None => Vec::new(),
    }
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| string_value(Some(value)))
            .collect(),
        Some(value) => string_value(Some(value)).into_iter().collect(),
        None => Vec::new(),
    }
}

fn for_each_arrayish<F>(value: Option<&Value>, mut handler: F)
where
    F: FnMut(&Value, usize),
{
    match value {
        Some(Value::Array(values)) => {
            for (index, item) in values.iter().enumerate() {
                handler(item, index);
            }
        }
        Some(Value::Object(_)) => handler(value.expect("checked some"), 0),
        _ => {}
    }
}

fn first_arrayish(value: &Value) -> Option<&Value> {
    match value {
        Value::Array(values) => values.first(),
        Value::Object(_) => Some(value),
        _ => None,
    }
}

fn object_raw(value: Option<&Value>) -> String {
    value
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_default()
}

fn metadata_for_fields(
    value: &Value,
    fields: &[(&str, &str)],
) -> Option<BTreeMap<String, Value>> {
    let mut metadata = BTreeMap::new();
    for (metadata_key, source_key) in fields {
        if let Some(child) = value.get(*source_key).and_then(metadata_value) {
            metadata.insert((*metadata_key).to_string(), child);
        }
    }
    (!metadata.is_empty()).then_some(metadata)
}

fn metadata_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(value) => {
            let normalized = normalize_display_string(value);
            (!normalized.is_empty()).then_some(Value::String(normalized))
        }
        Value::Number(_) | Value::Bool(_) => Some(value.clone()),
        Value::Array(values) => {
            let normalized = values
                .iter()
                .filter_map(metadata_value)
                .collect::<Vec<_>>();
            (!normalized.is_empty()).then_some(Value::Array(normalized))
        }
        Value::Object(_) | Value::Null => None,
    }
}

fn looks_garbled(value: &str) -> bool {
    value.contains('\u{fffd}') || value.matches('?').count() >= 3
}

fn path_metadata(path: String) -> Option<BTreeMap<String, Value>> {
    if path.trim().is_empty() {
        return None;
    }
    let mut metadata = BTreeMap::new();
    let exists = Path::new(&path).exists();
    metadata.insert("path".to_string(), Value::String(path));
    metadata.insert("exists".to_string(), Value::Bool(exists));
    Some(metadata)
}

fn path_like_metadata(value: &str) -> Option<BTreeMap<String, Value>> {
    if value.contains(":\\") || value.starts_with("\\\\") {
        path_metadata(value.to_string())
    } else {
        None
    }
}

fn executable_path_metadata(value: String) -> Option<BTreeMap<String, Value>> {
    let trimmed = value.trim().trim_matches('"');
    if trimmed.contains(":\\") {
        let path = trimmed
            .split(" -")
            .next()
            .unwrap_or(trimmed)
            .trim()
            .trim_matches('"');
        return path_metadata(path.to_string());
    }
    None
}

fn metric(
    id: &str,
    label: &str,
    value: String,
    detail: String,
    status: EnvironmentItemStatus,
) -> EnvironmentSummaryMetric {
    EnvironmentSummaryMetric {
        id: id.to_string(),
        label: label.to_string(),
        value,
        detail,
        status,
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn empty_as_unknown(value: &str) -> String {
    if value.trim().is_empty() {
        "未知".to_string()
    } else {
        value.to_string()
    }
}

fn count_category(items: &[EnvironmentItem], category: &str) -> usize {
    items.iter().filter(|item| item.category == category).count()
}

fn extract_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (start <= end).then(|| &text[start..=end])
}

/// Dispatch: run the appropriate populate_* functions for the given group ID and partial payload.
/// Each group only receives the JSON keys relevant to it, so missing keys are handled gracefully
/// by the existing for_each_arrayish / push_optional_field utilities.
pub(crate) fn dispatch_group(
    group: &str,
    payload: &Value,
    data_dir: &Path,
    log_dir: &Path,
    items: &mut Vec<EnvironmentItem>,
    updated_at: &str,
) {
    match group {
        "fast" => {
            populate_system_items(payload, items, updated_at);
            populate_environment_items(payload, items, updated_at);
            populate_path_items(payload, items, updated_at);
            populate_registry_items(payload, items, updated_at);
            populate_app_items(data_dir, log_dir, items, updated_at);
            populate_permission_items(payload, items, updated_at);
        }
        "hardware" => {
            populate_hardware_items(payload, items, updated_at);
        }
        "storage" => {
            populate_storage_items(payload, items, updated_at);
        }
        "network" => {
            populate_network_items(payload, items, updated_at);
        }
        "process" => {
            populate_process_items(payload, items, updated_at);
        }
        "service_driver" => {
            populate_service_items(payload, items, updated_at);
            populate_driver_items(payload, items, updated_at);
        }
        "software" => {
            populate_software_items(payload, items, updated_at);
            // startupItems bundled in this PS script
            populate_automation_items(payload, items, updated_at);
        }
        "automation" => {
            // scheduledTasks only (startupItems were already handled in "software")
            populate_automation_items(payload, items, updated_at);
        }
        "security" => {
            populate_security_items(payload, items, updated_at);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_path_entries_and_keeps_order() {
        assert_eq!(
            split_path_entries("C:\\Windows\\System32; ;D:\\Tools;C:\\Windows"),
            vec![
                "C:\\Windows\\System32".to_string(),
                "D:\\Tools".to_string(),
                "C:\\Windows".to_string()
            ]
        );
    }

    #[test]
    fn category_status_prefers_warning_over_info() {
        let ok = EnvironmentItem {
            id: "a".to_string(),
            category: "system".to_string(),
            subcategory: Some("system.os".to_string()),
            subcategory_label: Some("操作系统".to_string()),
            name: "A".to_string(),
            value: "A".to_string(),
            raw_value: None,
            source: "test".to_string(),
            updated_at: "now".to_string(),
            status: EnvironmentItemStatus::Ok,
            tags: Vec::new(),
            details: Vec::new(),
            metadata: None,
        };
        let mut warning = ok.clone();
        warning.status = EnvironmentItemStatus::Warning;

        assert_eq!(category_status(&[&ok, &warning]), EnvironmentItemStatus::Warning);
    }

    #[test]
    fn normalizes_missing_fields_to_empty_categories() {
        let snapshot = collect_environment_snapshot(Path::new("C:\\data"), Path::new("C:\\logs"));
        assert!(snapshot
            .categories
            .iter()
            .any(|category| category.id == "path"));
        assert!(snapshot.items.iter().any(|item| item.id == "path-combined"));
    }

    #[test]
    fn extracts_embedded_json_object() {
        assert_eq!(
            extract_json_object("noise {\"ok\":true}\n"),
            Some("{\"ok\":true}")
        );
    }

    #[test]
    fn normalizes_windows_json_dates() {
        assert_eq!(
            normalize_windows_json_date("/Date(1740949211000)/"),
            Some("2025-03-02T21:00:11Z".to_string())
        );
    }

    #[test]
    fn strips_replacement_characters_from_display_values() {
        assert_eq!(normalize_display_string("链路 · ��� 2"), "链路 · 2");
    }

    #[test]
    fn builds_parent_and_child_category_counts() {
        let mut items = Vec::new();
        push_item(
            &mut items,
            PushItem {
                id: "runtime-node",
                category: "software",
                name: "node",
                value: "C:\\Program Files\\nodejs\\node.exe".to_string(),
                raw_value: None,
                source: "where.exe",
                updated_at: "now",
                status: EnvironmentItemStatus::Ok,
                tags: vec!["runtime"],
                metadata: None,
            },
        );
        let categories = build_categories(&items);
        let software = categories
            .iter()
            .find(|category| category.id == "software")
            .expect("software parent");
        let runtime = categories
            .iter()
            .find(|category| category.id == "software.runtime")
            .expect("runtime child");

        assert_eq!(software.count, 1);
        assert_eq!(runtime.count, 1);
    }

    #[test]
    fn path_metadata_records_existence() {
        let metadata = path_metadata("C:\\".to_string()).expect("metadata");
        assert_eq!(metadata.get("exists"), Some(&Value::Bool(true)));
    }
}
