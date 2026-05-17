//! Streaming parallel environment scanner.
//!
//! Splits the monolithic PowerShell scan into independent per-category groups that
//! run concurrently. Each group emits Tauri events as it completes so the frontend
//! can render results progressively instead of waiting for the full scan.
//!
//! Event protocol:
//!   env://job-started   { jobId, isAdmin, generatedAt }
//!   env://group-started { jobId, group }
//!   env://items         { jobId, group, items: EnvironmentItem[] }
//!   env://group-done    { jobId, group, itemCount, status }  status = "done"|"failed"
//!   env://job-done      { jobId, durationMs, totalItems }
//!   env://job-cancelled { jobId }

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::AppHandle;
use tauri::Emitter;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::environment::{dispatch_group, EnvironmentItem};
use crate::errors::AppError;
use crate::models::LastResult;

// ── Scan group definitions ────────────────────────────────────────────────────

/// One independent collector unit: a group id, the categories it covers, and the
/// PowerShell script that populates them.
struct ScanGroup {
    id: &'static str,
    ps_script: fn(bool) -> String,
}

static GROUPS: &[ScanGroup] = &[
    ScanGroup {
        id: "fast",
        ps_script: ps_fast,
    },
    ScanGroup {
        id: "hardware",
        ps_script: ps_hardware,
    },
    ScanGroup {
        id: "storage",
        ps_script: ps_storage,
    },
    ScanGroup {
        id: "network",
        ps_script: ps_network,
    },
    ScanGroup {
        id: "process",
        ps_script: ps_process,
    },
    ScanGroup {
        id: "service_driver",
        ps_script: ps_service_driver,
    },
    ScanGroup {
        id: "software",
        ps_script: ps_software,
    },
    ScanGroup {
        id: "automation",
        ps_script: ps_automation,
    },
    ScanGroup {
        id: "security",
        ps_script: ps_security,
    },
];

// ── Public entry point ────────────────────────────────────────────────────────

pub struct ScanOutcome {
    pub result: LastResult,
    pub duration_ms: u128,
    pub message: Option<String>,
}

pub async fn start_scan(
    app: AppHandle,
    job_id: String,
    data_dir: PathBuf,
    log_dir: PathBuf,
    is_admin: bool,
    cancel: Arc<AtomicBool>,
) -> ScanOutcome {
    let started = Instant::now();
    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());

    let _ = app.emit(
        "env://job-started",
        serde_json::json!({
            "jobId": &job_id,
            "isAdmin": is_admin,
            "generatedAt": &generated_at,
            "totalGroups": GROUPS.len(),
        }),
    );

    let mut handles = Vec::new();

    for group in GROUPS {
        if cancel.load(Ordering::Relaxed) {
            break;
        }

        let app_c = app.clone();
        let job_id_c = job_id.clone();
        let generated_at_c = generated_at.clone();
        let data_dir_c = data_dir.clone();
        let log_dir_c = log_dir.clone();
        let cancel_c = cancel.clone();
        let group_id = group.id;
        let script = (group.ps_script)(is_admin);

        let handle = tauri::async_runtime::spawn_blocking(move || {
            if cancel_c.load(Ordering::Relaxed) {
                return false;
            }
            let _ = app_c.emit(
                "env://group-started",
                serde_json::json!({
                    "jobId": &job_id_c, "group": group_id,
                }),
            );

            let mut items: Vec<EnvironmentItem> = Vec::new();

            match run_group_script(&script) {
                Ok(payload) => {
                    dispatch_group(
                        group_id,
                        &payload,
                        &data_dir_c,
                        &log_dir_c,
                        &mut items,
                        &generated_at_c,
                    );
                    if cancel_c.load(Ordering::Relaxed) {
                        return false;
                    }
                    let count = items.len();
                    let _ = app_c.emit(
                        "env://items",
                        serde_json::json!({
                            "jobId": &job_id_c, "group": group_id, "items": &items,
                        }),
                    );
                    if cancel_c.load(Ordering::Relaxed) {
                        return false;
                    }
                    let _ = app_c.emit(
                        "env://group-done",
                        serde_json::json!({
                            "jobId": &job_id_c, "group": group_id,
                            "itemCount": count, "status": "done",
                        }),
                    );
                    false
                }
                Err(err) => {
                    if cancel_c.load(Ordering::Relaxed) {
                        return false;
                    }
                    let _ = app_c.emit(
                        "env://group-done",
                        serde_json::json!({
                            "jobId": &job_id_c, "group": group_id,
                            "status": "failed", "error": err.to_string(),
                        }),
                    );
                    true
                }
            }
        });

        handles.push(handle);
    }

    let mut failed_groups = 0_u32;
    for handle in handles {
        if handle.await.unwrap_or(true) {
            failed_groups += 1;
        }
    }

    let duration_ms = started.elapsed().as_millis();
    if cancel.load(Ordering::Relaxed) {
        ScanOutcome {
            result: LastResult::Cancelled,
            duration_ms,
            message: Some("用户取消扫描".to_string()),
        }
    } else {
        if failed_groups > 0 {
            ScanOutcome {
                result: LastResult::Failed,
                duration_ms,
                message: Some(format!("{failed_groups} 个扫描组失败")),
            }
        } else {
            ScanOutcome {
                result: LastResult::Success,
                duration_ms,
                message: None,
            }
        }
    }
}

// ── Script executor ───────────────────────────────────────────────────────────

fn run_group_script(script: &str) -> Result<Value, AppError> {
    let stdout = super::run_powershell(script, Duration::from_secs(60))?;
    let json_text = super::extract_json_object(&stdout)
        .ok_or_else(|| AppError::Message("PowerShell 未返回 JSON。".to_string()))?;
    Ok(serde_json::from_str(json_text)?)
}

// ── Per-group PowerShell scripts ──────────────────────────────────────────────

/// Common script header (encoding, Safe helper, warning accumulator).
fn ps_header() -> &'static str {
    r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function Safe([string]$n, [scriptblock]$b) { try { & $b } catch { @() } }
"#
}

// Group: fast — system, env, path, registry, permissions
fn ps_fast(_is_admin: bool) -> String {
    format!(
        r#"{}
function EnvMap($target) {{
  $r = [ordered]@{{}}
  try {{ [Environment]::GetEnvironmentVariables($target).GetEnumerator() | Sort-Object Name | ForEach-Object {{ $r[[string]$_.Name] = [string]$_.Value }} }} catch {{}}
  $r
}}
$isAdmin = Safe 'identity' {{
  $i = [Security.Principal.WindowsIdentity]::GetCurrent()
  [Security.Principal.WindowsPrincipal]::new($i).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}}
@{{
  os = Safe 'os' {{ Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture,
    @{{n='InstallDate';e={{$_.InstallDate.ToString('o')}}}}, @{{n='LastBootUpTime';e={{$_.LastBootUpTime.ToString('o')}}}},
    TotalVisibleMemorySize, FreePhysicalMemory, RegisteredUser, WindowsDirectory, SystemDirectory }}
  computer = Safe 'computer' {{ Get-CimInstance Win32_ComputerSystem | Select-Object Name, Domain, Manufacturer, Model,
    TotalPhysicalMemory, NumberOfProcessors, NumberOfLogicalProcessors, SystemType, UserName, Workgroup }}
  timezone = Safe 'tz' {{ Get-TimeZone | Select-Object Id, DisplayName, @{{n='BaseUtcOffset';e={{$_.BaseUtcOffset.ToString()}}}}, SupportsDaylightSavingTime }}
  culture = Safe 'culture' {{ [pscustomobject]@{{ Culture=(Get-Culture).Name; DisplayName=(Get-Culture).DisplayName; UICulture=(Get-UICulture).Name; UIName=(Get-UICulture).DisplayName }} }}
  envMachine = EnvMap 'Machine'
  envUser = EnvMap 'User'
  pathMachine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  pathUser = [Environment]::GetEnvironmentVariable('Path', 'User')
  registry = [ordered]@{{
    currentVersion = Safe 'cv' {{ Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, DisplayVersion, CurrentBuild, Ubr, EditionID, InstallationType }}
    powershell = Safe 'ps' {{ Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine' | Select-Object PowerShellVersion, RuntimeVersion }}
  }}
  permissions = [ordered]@{{
    isAdmin = $isAdmin
    executionPolicy = (Safe 'ep' {{ Get-ExecutionPolicy }})
    userName = [Environment]::UserName
    userDomainName = [Environment]::UserDomainName
  }}
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: hardware — CPU, memory, GPU, board, TPM, secure boot, PnP
fn ps_hardware(_is_admin: bool) -> String {
    format!(
        r#"{}
function Limited([string]$n, $items) {{
  $a = @($items)
  if ($a.Count -gt 200) {{ return @($a | Select-Object -First 200) }}
  $a
}}
@{{
  cpus = @(Safe 'cpus' {{ Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation, ProcessorId, Architecture }})
  bios = Safe 'bios' {{ Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, @{{n='ReleaseDate';e={{$_.ReleaseDate.ToString('o')}}}}, SerialNumber }}
  baseboard = Safe 'baseboard' {{ Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, Version, SerialNumber }}
  memoryModules = @(Limited 'mem' (Safe 'mem' {{ Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, DeviceLocator, Manufacturer, PartNumber, SerialNumber, Capacity, Speed, ConfiguredClockSpeed }}))
  gpus = @(Limited 'gpus' (Safe 'gpus' {{ Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor, CurrentHorizontalResolution, CurrentVerticalResolution }}))
  monitors = @(Limited 'mon' (Safe 'mon' {{ Get-CimInstance Win32_DesktopMonitor | Select-Object Name, MonitorType, ScreenWidth, ScreenHeight, Status }}))
  batteries = @(Limited 'bat' (Safe 'bat' {{ Get-CimInstance Win32_Battery | Select-Object Name, BatteryStatus, EstimatedChargeRemaining, EstimatedRunTime }}))
  powerPlan = Safe 'pwr' {{ (powercfg /GetActiveScheme) -join "`n" }}
  secureBoot = Safe 'sb' {{ Confirm-SecureBootUEFI }}
  tpm = Safe 'tpm' {{ Get-Tpm | Select-Object TpmPresent, TpmReady, TpmEnabled, ManagedAuthLevel, ManufacturerIdTxt }}
  pnpDevices = @(Limited 'pnp' (Safe 'pnp' {{ Get-PnpDevice -PresentOnly | Select-Object Status, Class, FriendlyName, InstanceId }}))
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: storage
fn ps_storage(is_admin: bool) -> String {
    let bitlocker = if is_admin {
        "bitlocker = @(Safe 'bl' { Get-BitLockerVolume | Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod })"
    } else {
        "bitlocker = @()"
    };
    format!(
        r#"{}
function Limited([string]$n, $items) {{
  $a = @($items); if ($a.Count -gt 500) {{ return @($a | Select-Object -First 500) }}; $a
}}
@{{
  logicalDisks = @(Safe 'ld' {{ Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, DriveType, FileSystem, Size, FreeSpace }})
  physicalDisks = @(Safe 'pd' {{ Get-CimInstance Win32_DiskDrive | Select-Object Model, InterfaceType, Size, MediaType, SerialNumber, Status }})
  partitions = @(Limited 'part' (Safe 'part' {{ Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, Type, Size, Offset, IsActive, IsBoot, IsSystem }}))
  volumes = @(Limited 'vol' (Safe 'vol' {{ Get-Volume | Select-Object DriveLetter, FileSystemLabel, FileSystem, HealthStatus, OperationalStatus, Size, SizeRemaining, DriveType }}))
  {bitlocker}
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: network
fn ps_network(_is_admin: bool) -> String {
    format!(
        r#"{}
function Limited([string]$n, $items) {{
  $a = @($items); if ($a.Count -gt 500) {{ return @($a | Select-Object -First 500) }}; $a
}}
function FileSnapshot([string]$path) {{
  $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  if ($item) {{ [pscustomobject]@{{ Path=$path; Exists=$true; Length=$item.Length; LastWriteTime=$item.LastWriteTime.ToString('o') }} }}
  else {{ [pscustomobject]@{{ Path=$path; Exists=$false; Length=$null; LastWriteTime=$null }} }}
}}
@{{
  networkConfigs = @(Safe 'nc' {{ Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object {{ $_.IPEnabled -eq $true }} | Select-Object Description, MACAddress, IPAddress, IPSubnet, DefaultIPGateway, DHCPEnabled, DHCPServer, DNSServerSearchOrder }})
  netAdapters = @(Limited 'na' (Safe 'na' {{ Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress, InterfaceIndex }}))
  routes = @(Limited 'rt' (Safe 'rt' {{ Get-NetRoute | Select-Object DestinationPrefix, NextHop, InterfaceAlias, RouteMetric, AddressFamily }}))
  tcpListeners = @(Limited 'tcp' (Safe 'tcp' {{ Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess, State }}))
  udpListeners = @(Limited 'udp' (Safe 'udp' {{ Get-NetUDPEndpoint | Select-Object LocalAddress, LocalPort, OwningProcess }}))
  proxy = Safe 'proxy' {{ Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' | Select-Object ProxyEnable, ProxyServer, AutoConfigURL }}
  hostsFile = FileSnapshot "$env:SystemRoot\System32\drivers\etc\hosts"
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: process
fn ps_process(_is_admin: bool) -> String {
    format!(
        r#"{}
$procs = @(Safe 'procs' {{ Get-Process }})
@{{
  processCount = $procs.Count
  processes = @($procs | Sort-Object ProcessName | Select-Object -First 1000 ProcessName, Id, CPU, WorkingSet64, Path, MainWindowTitle)
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: service_driver — services + kernel drivers
fn ps_service_driver(_is_admin: bool) -> String {
    format!(
        r#"{}
$svcs = @(Safe 'svcs' {{ Get-CimInstance Win32_Service }})
$drvs = @(Safe 'drvs' {{ Get-CimInstance Win32_SystemDriver }})
@{{
  serviceCount = $svcs.Count
  runningServiceCount = @($svcs | Where-Object {{ $_.State -eq 'Running' }}).Count
  services = @($svcs | Sort-Object DisplayName | Select-Object -First 1000 Name, DisplayName, State, StartMode, PathName, Description)
  driverCount = $drvs.Count
  runningDriverCount = @($drvs | Where-Object {{ $_.State -eq 'Running' }}).Count
  drivers = @($drvs | Sort-Object DisplayName | Select-Object -First 1000 Name, DisplayName, State, StartMode, PathName, Description)
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: software — runtime tools, shell profiles, installed apps, startup items
fn ps_software(_is_admin: bool) -> String {
    format!(
        r#"{}
function Limited([string]$n, $items) {{
  $a = @($items); if ($a.Count -gt 1000) {{ return @($a | Select-Object -First 1000) }}; $a
}}
function Get-UninstallApps {{
  $paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach ($p in $paths) {{
    Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object {{ $_.DisplayName }} |
      Select-Object @{{n='Scope';e={{if($p.StartsWith('HKCU')){{'{{'}}User{{'}}'}}else{{'{{'}}Machine{{'}}'}}}} }}, DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation, UninstallString
  }}
}}
function Get-StartupItems {{
  $regPaths = @(
    @{{ Scope='Machine'; Path='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' }},
    @{{ Scope='Machine'; Path='HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' }},
    @{{ Scope='User'; Path='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' }}
  )
  foreach ($e in $regPaths) {{
    $props = Get-ItemProperty $e.Path -ErrorAction SilentlyContinue
    if ($props) {{ $props.PSObject.Properties | Where-Object {{ $_.Name -notlike 'PS*' }} | ForEach-Object {{ [pscustomobject]@{{ Scope=$e.Scope; Name=$_.Name; Command=[string]$_.Value; Source=$e.Path }} }} }}
  }}
  foreach ($folder in @([Environment]::GetFolderPath('Startup'),[Environment]::GetFolderPath('CommonStartup')) | Where-Object {{ $_ }}) {{
    Get-ChildItem -LiteralPath $folder -Force -ErrorAction SilentlyContinue | ForEach-Object {{ [pscustomobject]@{{ Scope='Folder'; Name=$_.Name; Command=$_.FullName; Source=$folder }} }}
  }}
}}
$rtTools = @('git','node','npm','pnpm','python','py','cargo','rustc','dotnet','java','go','code','pwsh','powershell','winget','docker','wsl')
@{{
  runtimeTools = @(foreach ($t in $rtTools) {{
    $paths = @(where.exe $t 2>$null)
    [pscustomobject]@{{ Name=$t; Found=($paths.Count -gt 0); Paths=$paths }}
  }})
  shellProfiles = @(Safe 'profiles' {{
    @(
      @{{Scope='CurrentUserCurrentHost';Path=$PROFILE.CurrentUserCurrentHost}},
      @{{Scope='CurrentUserAllHosts';Path=$PROFILE.CurrentUserAllHosts}},
      @{{Scope='AllUsersCurrentHost';Path=$PROFILE.AllUsersCurrentHost}},
      @{{Scope='AllUsersAllHosts';Path=$PROFILE.AllUsersAllHosts}}
    ) | ForEach-Object {{ [pscustomobject]@{{Scope=$_.Scope;Path=$_.Path;Exists=(Test-Path -LiteralPath $_.Path)}} }}
  }})
  installedApps = @(Limited 'apps' (Safe 'apps' {{ Get-UninstallApps | Sort-Object DisplayName }}))
  startupItems = @(Limited 'si' (Safe 'si' {{ Get-StartupItems | Sort-Object Name }}))
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: automation — scheduled tasks (slow, separate group)
fn ps_automation(_is_admin: bool) -> String {
    format!(
        r#"{}
@{{
  scheduledTasks = @(Safe 'tasks' {{ Get-ScheduledTask | Select-Object -First 1000 TaskName, TaskPath, State, Author, Description }})
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}

// Group: security — Defender, firewall, certs, event logs
fn ps_security(_is_admin: bool) -> String {
    format!(
        r#"{}
function Limited([string]$n, $items) {{
  $a = @($items); if ($a.Count -gt 500) {{ return @($a | Select-Object -First 500) }}; $a
}}
@{{
  defender = Safe 'def' {{ Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntispywareEnabled, NISEnabled, AntivirusSignatureLastUpdated, QuickScanEndTime, FullScanEndTime }}
  firewallProfiles = @(Safe 'fw' {{ Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, NotifyOnListen }})
  certificates = @(Limited 'certs' (Safe 'certs' {{
    foreach ($store in @('Cert:\CurrentUser\My','Cert:\LocalMachine\My','Cert:\LocalMachine\Root')) {{
      Get-ChildItem $store -ErrorAction SilentlyContinue | Select-Object @{{n='Store';e={{$store}}}}, Subject, Issuer, Thumbprint, @{{n='NotAfter';e={{$_.NotAfter.ToString('o')}}}}
    }}
  }}))
  eventLogs = @(Limited 'evtlog' (Safe 'evtlog' {{ Get-WinEvent -ListLog * | Select-Object LogName, RecordCount, MaximumSizeInBytes, IsEnabled, @{{n='LastWriteTime';e={{if($_.LastWriteTime){{$_.LastWriteTime.ToString('o')}}else{{$null}}}}}} }}))
}} | ConvertTo-Json -Depth 10 -Compress
"#,
        ps_header()
    )
}
