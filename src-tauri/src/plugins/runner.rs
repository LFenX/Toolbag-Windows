//! Plugin runner.
//!
//! Dispatches command invocations to the appropriate runtime:
//!
//! - `Builtin` → routes to a host function registered at startup.
//! - `Sidecar` → spawns the binary, writes a single request frame on stdin,
//!   streams progress/log/result/error frames from stdout via NDJSON, and emits
//!   them as Tauri events.
//! - `None` → returns `E_PROTOCOL`; pure-UI tools shouldn't reach the runner.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::database::Database;
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::models::LastResult;
use crate::plugins::manifest::{PluginManifest, RuntimeKind};

pub type BuiltinHandler =
    Box<dyn Fn(BuiltinCallContext) -> AppResult<Value> + Send + Sync + 'static>;

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

pub struct Runner {
    builtins: Mutex<HashMap<String, BuiltinHandler>>,
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Runner {
    pub fn new() -> Self {
        Self {
            builtins: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_builtin(&self, key: &str, handler: BuiltinHandler) {
        if let Ok(mut map) = self.builtins.lock() {
            map.insert(key.to_string(), handler);
        }
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        if let Ok(map) = self.jobs.lock() {
            if let Some(flag) = map.get(job_id) {
                flag.store(true, Ordering::Relaxed);
                return true;
            }
        }
        false
    }

    pub fn start(
        self: &Arc<Self>,
        app: AppHandle,
        database: Arc<Database>,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
        command: String,
        params: Value,
    ) -> AppResult<String> {
        let job_id = uuid::Uuid::new_v4().to_string();
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
                manifest,
                plugin_dir,
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
                "",
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
    fn dispatch(
        &self,
        app: AppHandle,
        manifest: PluginManifest,
        plugin_dir: PathBuf,
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
            RuntimeKind::Sidecar => {
                self.dispatch_sidecar(app, manifest, plugin_dir, command, job_id, params, cancel)
            }
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

        let mut cmd = std::process::Command::new(&binary_path);
        cmd.args(&manifest.runtime.args);
        for (k, v) in &manifest.runtime.env {
            cmd.env(k, v);
        }
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
    #[allow(dead_code)]
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
    data: Option<Value>,
}

impl Default for Runner {
    fn default() -> Self {
        Self::new()
    }
}
