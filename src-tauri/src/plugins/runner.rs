//! Plugin runner.
//!
//! Dispatches command invocations to the appropriate runtime:
//!
//! - `Builtin` → routes to a host function registered at startup.
//! - `Sidecar` (Ephemeral) → spawns the binary, writes a single request frame
//!   on stdin, streams progress/log/result/error frames from stdout via
//!   NDJSON, kills the child when it sees `result`/`error`/cancel.
//! - `Sidecar` (Persistent) → reuses a long-lived child per plugin. Every
//!   request is one NDJSON frame multiplexed by `id`; a dedicated reader
//!   thread fans the response frames back out to Tauri events.
//! - `None` → returns `E_PROTOCOL`; pure-UI tools shouldn't reach the runner.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::database::Database;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::models::LastResult;
use crate::plugins::manifest::{PluginManifest, RuntimeKind, SidecarLifecycle};

pub type BuiltinHandler =
    Box<dyn Fn(BuiltinCallContext) -> AppResult<Value> + Send + Sync + 'static>;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct BuiltinCallContext {
    pub app: AppHandle,
    #[allow(dead_code)]
    pub plugin_id: String,
    #[allow(dead_code)]
    pub command: String,
    pub job_id: String,
    #[allow(dead_code)]
    pub params: Value,
    pub cancel: Arc<AtomicBool>,
}

/// Per-job bookkeeping for a persistent sidecar.
struct ActiveJob {
    plugin_id: String,
    command: String,
    started_at: Instant,
}

/// A long-lived sidecar process. Lives in `Runner::sessions` keyed by
/// `plugin_id` — every tab pointing at the same plugin shares one OS process.
struct PersistentSession {
    #[allow(dead_code)]
    plugin_id: String,
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    active_jobs: Mutex<HashMap<String, ActiveJob>>,
}

impl PersistentSession {
    fn write_frame(&self, line: &str) -> AppResult<()> {
        let mut guard = self
            .stdin
            .lock()
            .map_err(|_| AppError::coded(ErrorCode::Internal, "session stdin lock poisoned"))?;
        let stdin = guard
            .as_mut()
            .ok_or_else(|| AppError::coded(ErrorCode::Protocol, "session stdin 不可用"))?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|e| AppError::coded(ErrorCode::Io, format!("sidecar 写入失败：{e}")))?;
        stdin
            .flush()
            .map_err(|e| AppError::coded(ErrorCode::Io, format!("sidecar 刷新失败：{e}")))?;
        Ok(())
    }
}

pub struct Runner {
    builtins: Mutex<HashMap<String, BuiltinHandler>>,
    /// Cancel flags for ephemeral jobs — keyed by job_id, the dispatch loop
    /// polls this flag and kills the child when set.
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Long-lived sidecars, keyed by plugin_id.
    sessions: Mutex<HashMap<String, Arc<PersistentSession>>>,
}

impl Runner {
    pub fn new() -> Self {
        Self {
            builtins: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_builtin(&self, key: &str, handler: BuiltinHandler) {
        if let Ok(mut map) = self.builtins.lock() {
            map.insert(key.to_string(), handler);
        }
    }

    /// Cancel a running job. For ephemeral sidecars this flips a flag so the
    /// dispatch loop kills the child; for persistent sidecars it sends a
    /// `cancel` frame so the sidecar can roll back its in-flight work.
    pub fn cancel(&self, job_id: &str) -> bool {
        if let Ok(map) = self.jobs.lock() {
            if let Some(flag) = map.get(job_id) {
                flag.store(true, Ordering::Relaxed);
                return true;
            }
        }
        // No ephemeral match — check every persistent session for this job.
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        for session in sessions.values() {
            let active = session.active_jobs.lock();
            if let Ok(jobs) = active {
                if jobs.contains_key(job_id) {
                    let frame = format!(
                        "{}\n",
                        serde_json::json!({ "type": "cancel", "id": job_id })
                    );
                    let _ = session.write_frame(&frame);
                    return true;
                }
            }
        }
        false
    }

    /// Push a raw NDJSON frame into a persistent sidecar's stdin. Plugins
    /// can use this to send `input` / `cancel` / custom protocol frames in
    /// addition to the standard `request` frame issued by
    /// `start_plugin_command`. Errors if no persistent session exists yet —
    /// callers should ensure they've kicked off the session first (typically
    /// via an initial command call).
    pub fn send_frame(&self, plugin_id: &str, frame: Value) -> AppResult<()> {
        let session = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| AppError::coded(ErrorCode::Internal, "sessions lock poisoned"))?;
            sessions.get(plugin_id).map(Arc::clone)
        };
        let session = session.ok_or_else(|| {
            AppError::coded(
                ErrorCode::NotFound,
                format!("插件 {plugin_id} 没有正在运行的持久化会话"),
            )
        })?;
        let line = serde_json::to_string(&frame)
            .map_err(|e| AppError::coded(ErrorCode::Internal, format!("帧序列化失败：{e}")))?
            + "\n";
        session.write_frame(&line)
    }

    /// Best-effort: send a shutdown frame to the persistent sidecar and
    /// remove its session. Subsequent requests will spawn a fresh process.
    /// Returns `false` if no session exists for this plugin.
    pub fn shutdown_session(&self, plugin_id: &str) -> bool {
        let session = {
            let mut sessions = match self.sessions.lock() {
                Ok(s) => s,
                Err(_) => return false,
            };
            sessions.remove(plugin_id)
        };
        let Some(session) = session else {
            return false;
        };
        let frame = format!("{}\n", serde_json::json!({ "type": "shutdown" }));
        let _ = session.write_frame(&frame);
        // Drop stdin so the sidecar sees EOF if it's blocked on read.
        if let Ok(mut guard) = session.stdin.lock() {
            *guard = None;
        }
        // Give it a short grace window, then kill.
        if let Ok(mut child_guard) = session.child.lock() {
            if let Some(mut child) = child_guard.take() {
                let deadline = Instant::now() + Duration::from_millis(1500);
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) if Instant::now() >= deadline => {
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        Ok(None) => {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        Err(_) => {
                            let _ = child.kill();
                            break;
                        }
                    }
                }
            }
        }
        true
    }

    #[allow(clippy::too_many_arguments)]
    pub fn start(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        plugin_data_dir: PathBuf,
        command: String,
        params: Value,
    ) -> AppResult<String> {
        let job_id = uuid::Uuid::new_v4().to_string();

        // Persistent sidecar: don't spin up a per-request thread — the
        // session's reader thread emits all response events asynchronously.
        if matches!(manifest.runtime.kind, RuntimeKind::Sidecar)
            && manifest.runtime.lifecycle == SidecarLifecycle::Persistent
        {
            self.start_persistent(
                app,
                database,
                manifest,
                plugin_dir,
                plugin_data_dir,
                command,
                params,
                job_id,
            )
        } else {
            self.start_ephemeral(
                app,
                database,
                manifest,
                plugin_dir,
                plugin_data_dir,
                command,
                params,
                job_id,
            )
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn start_ephemeral(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        plugin_data_dir: PathBuf,
        command: String,
        params: Value,
        job_id: String,
    ) -> AppResult<String> {
        let cancel = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.jobs.lock() {
            map.insert(job_id.clone(), cancel.clone());
        }
        let runner = Arc::clone(self);
        let job_id_clone = job_id.clone();
        std::thread::spawn(move || {
            let started = Instant::now();
            let result = runner.dispatch(
                app.clone(),
                manifest.clone(),
                plugin_dir,
                plugin_data_dir,
                command.clone(),
                job_id_clone.clone(),
                params,
                cancel.clone(),
            );
            let elapsed = started.elapsed().as_millis();
            let status = match &result {
                Ok(_) => LastResult::Success,
                Err(err) if err.code() == ErrorCode::Cancelled => LastResult::Cancelled,
                Err(_) => LastResult::Failed,
            };
            let _ = database.record_plugin_run(
                &manifest.id,
                &command,
                status,
                Some(elapsed),
                result.as_ref().err().map(|e| e.to_string()).as_deref(),
            );
            match result {
                Ok(value) => {
                    let _ = app.emit(
                        "plugin://job-result",
                        serde_json::json!({
                            "jobId": job_id_clone,
                            "data": value,
                        }),
                    );
                }
                Err(err) => {
                    let _ = app.emit(
                        "plugin://job-error",
                        serde_json::json!({
                            "jobId": job_id_clone,
                            "code": err.code().as_str(),
                            "message": err.to_string(),
                        }),
                    );
                }
            }
            let _ = app.emit(
                "plugin://job-done",
                serde_json::json!({
                    "jobId": job_id_clone,
                    "durationMs": elapsed as u64,
                }),
            );
            if let Ok(mut map) = runner.jobs.lock() {
                map.remove(&job_id_clone);
            }
        });
        Ok(job_id)
    }

    #[allow(clippy::too_many_arguments)]
    fn start_persistent(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        plugin_data_dir: PathBuf,
        command: String,
        params: Value,
        job_id: String,
    ) -> AppResult<String> {
        let session = self.get_or_spawn_session(
            app.clone(),
            database.clone(),
            &manifest,
            &plugin_dir,
            &plugin_data_dir,
        )?;
        if let Ok(mut jobs) = session.active_jobs.lock() {
            jobs.insert(
                job_id.clone(),
                ActiveJob {
                    plugin_id: manifest.id.clone(),
                    command: command.clone(),
                    started_at: Instant::now(),
                },
            );
        }
        let request = SidecarRequest {
            ty: "request".into(),
            id: job_id.clone(),
            command,
            params,
        };
        let line = serde_json::to_string(&request)? + "\n";
        if let Err(err) = session.write_frame(&line) {
            // Remove the optimistic job entry and surface a synchronous error.
            if let Ok(mut jobs) = session.active_jobs.lock() {
                jobs.remove(&job_id);
            }
            return Err(err);
        }
        Ok(job_id)
    }

    fn get_or_spawn_session(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        manifest: &PluginManifest,
        plugin_dir: &Path,
        plugin_data_dir: &Path,
    ) -> AppResult<Arc<PersistentSession>> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| AppError::coded(ErrorCode::Internal, "sessions lock poisoned"))?;
        if let Some(existing) = sessions.get(&manifest.id) {
            return Ok(Arc::clone(existing));
        }

        let binary =
            manifest.runtime.binary.clone().ok_or_else(|| {
                AppError::coded(ErrorCode::Manifest, "sidecar runtime 未声明 binary")
            })?;
        let binary_path = plugin_dir.join(binary);
        if !binary_path.exists() {
            return Err(AppError::coded(
                ErrorCode::NotFound,
                format!("sidecar 可执行文件缺失：{}", binary_path.display()),
            ));
        }

        let mut cmd = build_sidecar_command(&binary_path, manifest, plugin_dir, plugin_data_dir);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::coded(ErrorCode::Io, format!("sidecar 启动失败：{e}")))?;
        let stdin = child.stdin.take();
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::coded(ErrorCode::Protocol, "sidecar stdout 不可用"))?;

        let session = Arc::new(PersistentSession {
            plugin_id: manifest.id.clone(),
            stdin: Mutex::new(stdin),
            child: Mutex::new(Some(child)),
            active_jobs: Mutex::new(HashMap::new()),
        });
        sessions.insert(manifest.id.clone(), Arc::clone(&session));
        drop(sessions);

        let runner = Arc::clone(self);
        let session_for_thread = Arc::clone(&session);
        let plugin_id = manifest.id.clone();
        std::thread::spawn(move || {
            persistent_reader_loop(app, database, runner, session_for_thread, plugin_id, stdout);
        });

        Ok(session)
    }

    #[allow(clippy::too_many_arguments)]
    fn dispatch(
        &self,
        app: AppHandle,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        plugin_data_dir: PathBuf,
        command: String,
        job_id: String,
        params: Value,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<Value> {
        match manifest.runtime.kind {
            RuntimeKind::Builtin => {
                let key = manifest
                    .builtin_renderer
                    .clone()
                    .unwrap_or_else(|| manifest.id.clone());
                // Allow command-scoped registration: <builtin_renderer>/<command>.
                let scoped_key = format!("{key}/{command}");
                let map = self.builtins.lock().map_err(|_| {
                    AppError::coded(ErrorCode::Internal, "builtin registry poisoned")
                })?;
                let h = map
                    .get(&scoped_key)
                    .or_else(|| map.get(&key))
                    .ok_or_else(|| {
                        AppError::coded(
                            ErrorCode::NotFound,
                            format!("未找到 builtin 处理器：{key}"),
                        )
                    })?;
                h(BuiltinCallContext {
                    app,
                    plugin_id: manifest.id,
                    command,
                    job_id,
                    params,
                    cancel,
                })
            }
            RuntimeKind::Sidecar => self.dispatch_sidecar(
                app,
                manifest,
                plugin_dir,
                plugin_data_dir,
                command,
                job_id,
                params,
                cancel,
            ),
            RuntimeKind::None => Err(AppError::coded(
                ErrorCode::Protocol,
                "纯 UI 工具不应调用 start_plugin_command",
            )),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn dispatch_sidecar(
        &self,
        app: AppHandle,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        plugin_data_dir: PathBuf,
        command: String,
        job_id: String,
        params: Value,
        cancel: Arc<AtomicBool>,
    ) -> AppResult<Value> {
        let binary =
            manifest.runtime.binary.clone().ok_or_else(|| {
                AppError::coded(ErrorCode::Manifest, "sidecar runtime 未声明 binary")
            })?;
        let binary_path = plugin_dir.join(binary);
        if !binary_path.exists() {
            return Err(AppError::coded(
                ErrorCode::NotFound,
                format!("sidecar 可执行文件缺失：{}", binary_path.display()),
            ));
        }

        let mut cmd = build_sidecar_command(&binary_path, &manifest, &plugin_dir, &plugin_data_dir);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::coded(ErrorCode::Io, format!("sidecar 启动失败：{e}")))?;

        let request = SidecarRequest {
            ty: "request".into(),
            id: job_id.clone(),
            command: command.clone(),
            params,
        };
        let request_line = serde_json::to_string(&request)? + "\n";
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(request_line.as_bytes())?;
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::coded(ErrorCode::Protocol, "sidecar stdout 不可用"))?;
        let reader = BufReader::new(stdout);
        let mut final_result: Option<Value> = None;
        let mut final_error: Option<(ErrorCode, String)> = None;

        for line in reader.lines() {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                return Err(AppError::coded(ErrorCode::Cancelled, "已取消"));
            }
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }
            let frame: SidecarFrame = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(e) => {
                    final_error = Some((ErrorCode::Protocol, format!("非法 sidecar 帧：{e}")));
                    let _ = child.kill();
                    break;
                }
            };
            match frame.ty.as_str() {
                "ready" => {}
                "progress" => {
                    let _ = app.emit(
                        "plugin://job-progress",
                        serde_json::json!({
                            "jobId": job_id,
                            "value": frame.value,
                            "stage": frame.stage,
                            "message": frame.message,
                        }),
                    );
                }
                "log" => {
                    let _ = app.emit(
                        "plugin://job-log",
                        serde_json::json!({
                            "jobId": job_id,
                            "level": frame.level.unwrap_or_else(|| "info".into()),
                            "message": frame.message.unwrap_or_default(),
                        }),
                    );
                }
                "event" => {
                    emit_sidecar_event(&app, &manifest.id, frame.event, frame.data);
                }
                "result" => {
                    final_result = frame.data;
                    break;
                }
                "error" => {
                    final_error = Some((
                        ErrorCode::Protocol,
                        frame.message.unwrap_or_else(|| "sidecar 报错".into()),
                    ));
                    break;
                }
                _ => {}
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        if let Some((code, msg)) = final_error {
            return Err(AppError::coded(code, msg));
        }
        match final_result {
            Some(v) => Ok(v),
            None => Err(AppError::coded(
                ErrorCode::Protocol,
                "sidecar 未返回 result",
            )),
        }
    }
}

fn build_sidecar_command(
    binary_path: &Path,
    manifest: &PluginManifest,
    plugin_dir: &Path,
    plugin_data_dir: &Path,
) -> Command {
    let mut cmd = Command::new(binary_path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.args(&manifest.runtime.args);
    for (k, v) in &manifest.runtime.env {
        cmd.env(k, v);
    }
    cmd.env("TOOLBAG_PLUGIN_ID", &manifest.id);
    cmd.env("TOOLBAG_PLUGIN_DIR", plugin_dir);
    cmd.env("TOOLBAG_PLUGIN_DATA_DIR", plugin_data_dir);
    cmd
}

fn emit_sidecar_event(
    app: &AppHandle,
    plugin_id: &str,
    event: Option<String>,
    data: Option<Value>,
) {
    let Some(event) = event else {
        return;
    };
    let _ = app.emit(
        "plugin://sidecar-event",
        serde_json::json!({
            "pluginId": plugin_id,
            "event": event,
            "data": data.unwrap_or(Value::Null),
        }),
    );
}

/// Reader thread for a persistent sidecar. Fans NDJSON response frames out to
/// Tauri events keyed by the original `job_id`, records each job's outcome in
/// the database, and tears the session down on EOF / error.
fn persistent_reader_loop(
    app: AppHandle,
    database: Arc<Database>,
    runner: Arc<Runner>,
    session: Arc<PersistentSession>,
    plugin_id: String,
    stdout: std::process::ChildStdout,
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let frame: SidecarFrame = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let job_id = frame.id.clone().unwrap_or_default();
        match frame.ty.as_str() {
            "ready" => {
                // First-time readiness — clients don't observe it directly.
            }
            "progress" => {
                let _ = app.emit(
                    "plugin://job-progress",
                    serde_json::json!({
                        "jobId": job_id,
                        "value": frame.value,
                        "stage": frame.stage,
                        "message": frame.message,
                    }),
                );
            }
            "log" => {
                let _ = app.emit(
                    "plugin://job-log",
                    serde_json::json!({
                        "jobId": job_id,
                        "level": frame.level.unwrap_or_else(|| "info".into()),
                        "message": frame.message.unwrap_or_default(),
                    }),
                );
            }
            "event" => {
                emit_sidecar_event(&app, &plugin_id, frame.event, frame.data);
            }
            "result" => {
                let info = finalize_job(&session, &job_id);
                let elapsed = info.as_ref().map(|i| i.elapsed_ms).unwrap_or(0);
                let _ = app.emit(
                    "plugin://job-result",
                    serde_json::json!({ "jobId": job_id, "data": frame.data }),
                );
                let _ = app.emit(
                    "plugin://job-done",
                    serde_json::json!({ "jobId": job_id, "durationMs": elapsed }),
                );
                if let Some(info) = info {
                    let _ = database.record_plugin_run(
                        &info.plugin_id,
                        &info.command,
                        LastResult::Success,
                        Some(info.elapsed_ms),
                        None,
                    );
                }
            }
            "error" => {
                let info = finalize_job(&session, &job_id);
                let elapsed = info.as_ref().map(|i| i.elapsed_ms).unwrap_or(0);
                let message = frame.message.unwrap_or_else(|| "sidecar 报错".into());
                let _ = app.emit(
                    "plugin://job-error",
                    serde_json::json!({
                        "jobId": job_id,
                        "code": frame.code.unwrap_or_else(|| "E_PROTOCOL".into()),
                        "message": message.clone(),
                    }),
                );
                let _ = app.emit(
                    "plugin://job-done",
                    serde_json::json!({ "jobId": job_id, "durationMs": elapsed }),
                );
                if let Some(info) = info {
                    let _ = database.record_plugin_run(
                        &info.plugin_id,
                        &info.command,
                        LastResult::Failed,
                        Some(info.elapsed_ms),
                        Some(&message),
                    );
                }
            }
            _ => {}
        }
    }

    // EOF / error: surface a generic failure for any jobs still in flight and
    // drop the session so the next request spawns a fresh process.
    let in_flight: Vec<(String, ActiveJob)> = {
        let mut jobs = match session.active_jobs.lock() {
            Ok(j) => j,
            Err(_) => return,
        };
        jobs.drain().collect()
    };
    for (job_id, job) in in_flight {
        let elapsed = job.started_at.elapsed().as_millis() as u64;
        let _ = app.emit(
            "plugin://job-error",
            serde_json::json!({
                "jobId": &job_id,
                "code": "E_PROTOCOL",
                "message": "sidecar 已退出，请求未完成",
            }),
        );
        let _ = app.emit(
            "plugin://job-done",
            serde_json::json!({ "jobId": &job_id, "durationMs": elapsed }),
        );
        let _ = database.record_plugin_run(
            &job.plugin_id,
            &job.command,
            LastResult::Failed,
            Some(elapsed as u128),
            Some("sidecar exited"),
        );
    }
    if let Ok(mut sessions) = runner.sessions.lock() {
        sessions.remove(&plugin_id);
    }
    let _ = app.emit(
        "plugin://sidecar-event",
        serde_json::json!({
            "pluginId": plugin_id,
            "event": "manager.sidecarExit",
            "data": { "reason": "eof" },
        }),
    );
    // Reap the child if it's still around.
    if let Ok(mut child_guard) = session.child.lock() {
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

struct FinalizedJob {
    plugin_id: String,
    command: String,
    elapsed_ms: u128,
}

fn finalize_job(session: &PersistentSession, job_id: &str) -> Option<FinalizedJob> {
    let mut jobs = session.active_jobs.lock().ok()?;
    let job = jobs.remove(job_id)?;
    Some(FinalizedJob {
        plugin_id: job.plugin_id,
        command: job.command,
        elapsed_ms: job.started_at.elapsed().as_millis(),
    })
}

#[derive(Debug, Serialize)]
struct SidecarRequest {
    #[serde(rename = "type")]
    ty: String,
    id: String,
    command: String,
    params: Value,
}

#[derive(Debug, Deserialize)]
struct SidecarFrame {
    #[serde(rename = "type")]
    ty: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    value: Option<f64>,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    level: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    event: Option<String>,
    #[serde(default)]
    data: Option<Value>,
}

impl Default for Runner {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RiskLevel;
    use crate::plugins::manifest::{PluginRuntime, SidecarLifecycle};

    fn sidecar_manifest() -> PluginManifest {
        PluginManifest {
            schema: None,
            id: "com.lfen.toolbag.test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            category: "开发".to_string(),
            tags: vec![],
            description: "test".to_string(),
            detail_description: "test".to_string(),
            author: None,
            license: None,
            homepage: None,
            min_app_version: None,
            max_app_version: None,
            risk_level: RiskLevel::Caution,
            requires_elevation: false,
            permission_requirement: String::new(),
            data_access: String::new(),
            icon: None,
            runtime: PluginRuntime {
                kind: RuntimeKind::Sidecar,
                binary: Some("bin/test.exe".to_string()),
                args: vec!["--flag".to_string()],
                env: [("CUSTOM_ENV".to_string(), "ok".to_string())].into(),
                startup_timeout_ms: 3000,
                shutdown_timeout_ms: 1500,
                lifecycle: SidecarLifecycle::Persistent,
            },
            commands: vec![],
            ui: Some("ui.json".to_string()),
            builtin_renderer: Some("test-renderer".to_string()),
            bundled: false,
        }
    }

    #[test]
    fn build_sidecar_command_injects_plugin_environment() {
        let manifest = sidecar_manifest();
        let cmd = build_sidecar_command(
            Path::new("plugin/bin/test.exe"),
            &manifest,
            Path::new("plugin"),
            Path::new("plugin/data"),
        );
        let envs: HashMap<String, String> = cmd
            .get_envs()
            .filter_map(|(key, value)| {
                Some((
                    key.to_string_lossy().to_string(),
                    value?.to_string_lossy().to_string(),
                ))
            })
            .collect();

        assert_eq!(cmd.get_program(), Path::new("plugin/bin/test.exe"));
        assert_eq!(cmd.get_args().count(), 1);
        assert_eq!(envs.get("TOOLBAG_PLUGIN_ID"), Some(&manifest.id));
        assert_eq!(envs.get("TOOLBAG_PLUGIN_DIR"), Some(&"plugin".to_string()));
        assert_eq!(
            envs.get("TOOLBAG_PLUGIN_DATA_DIR"),
            Some(&"plugin/data".to_string())
        );
        assert_eq!(envs.get("CUSTOM_ENV"), Some(&"ok".to_string()));
    }
}
