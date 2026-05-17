//! Plugin installation pipeline.
//!
//! Steps for a remote install:
//! 1. Download `.tbpkg` + `.tbpkg.sig` to the staging dir.
//! 2. SHA256 the file and check against the registry-provided hash.
//! 3. Verify the minisign signature (see [`super::signature`]).
//! 4. Unzip into `staging/<id>/<version>/`.
//! 5. Parse `tool.json` and validate it.
//! 6. Move the staged dir to `plugins/<id>/<version>/`, update `current.txt`.
//! 7. Persist to SQLite.
//!
//! Local installs skip step 1 and accept any signature when not enforced.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::database::{Database, InstalledPluginRow};
use crate::errors::{AppError, AppResult, ErrorCode};
use crate::plugins::manifest::{parse_manifest, satisfies_app_version, PluginManifest};
use crate::plugins::signature;

#[derive(Debug, Clone)]
pub struct InstallSource {
    pub package_path: PathBuf,
    pub signature_path: Option<PathBuf>,
    pub source_url: String,
    pub expected_sha256: Option<String>,
}

pub struct Installer<'a> {
    pub plugins_root: &'a Path,
    pub staging_root: &'a Path,
    pub app_version: &'a str,
    pub database: &'a Database,
}

impl<'a> Installer<'a> {
    pub fn install(&self, source: InstallSource) -> AppResult<PluginManifest> {
        fs::create_dir_all(self.plugins_root)?;
        fs::create_dir_all(self.staging_root)?;

        if let Some(expected) = source.expected_sha256.as_deref() {
            let actual = sha256_hex(&source.package_path)?;
            if !expected.eq_ignore_ascii_case(&actual) {
                return Err(AppError::coded(
                    ErrorCode::Hash,
                    format!("sha256 不匹配（预期 {expected}，实际 {actual}）"),
                ));
            }
        }

        if let Some(sig_path) = &source.signature_path {
            let sig_text = fs::read_to_string(sig_path).map_err(AppError::from)?;
            signature::verify_file(&source.package_path, &sig_text)?;
        } else if signature::is_enforced() {
            return Err(AppError::coded(
                ErrorCode::Sig,
                "未提供签名文件，且当前构建启用了签名校验",
            ));
        }

        let staging_id = format!("install-{}", uuid::Uuid::new_v4());
        let staging_dir = self.staging_root.join(&staging_id);
        fs::create_dir_all(&staging_dir)?;
        unzip(&source.package_path, &staging_dir)?;

        let manifest_path = staging_dir.join("tool.json");
        let manifest_text = fs::read_to_string(&manifest_path)
            .map_err(|e| AppError::coded(ErrorCode::Manifest, format!("缺少 tool.json：{e}")))?;
        let manifest = parse_manifest(&manifest_text)?;

        if !satisfies_app_version(&manifest, self.app_version)? {
            return Err(AppError::coded(
                ErrorCode::Ver,
                format!(
                    "插件 {} 需要应用版本 >= {}，当前 {}",
                    manifest.id,
                    manifest.min_app_version.clone().unwrap_or_default(),
                    self.app_version
                ),
            ));
        }

        let plugin_dir = self.plugins_root.join(&manifest.id).join(&manifest.version);
        if plugin_dir.exists() {
            fs::remove_dir_all(&plugin_dir).ok();
        }
        fs::create_dir_all(plugin_dir.parent().unwrap())?;
        move_dir(&staging_dir, &plugin_dir)?;

        let current = self.plugins_root.join(&manifest.id).join("current.txt");
        fs::write(&current, manifest.version.as_bytes())?;

        let mut row = InstalledPluginRow {
            id: manifest.id.clone(),
            current_version: manifest.version.clone(),
            installed_at: String::new(),
            updated_at: String::new(),
            source: "user".to_string(),
            source_url: source.source_url,
            bundled: false,
            disabled: false,
            granted_perms: vec![],
        };
        if let Some(existing) = self.database.get_installed_plugin(&manifest.id)? {
            row.granted_perms = existing.granted_perms;
            row.bundled = existing.bundled || row.bundled;
        }
        self.database.upsert_installed_plugin(&row)?;
        Ok(manifest)
    }

    pub fn uninstall(&self, id: &str) -> AppResult<()> {
        let row = self
            .database
            .get_installed_plugin(id)?
            .ok_or_else(|| AppError::coded(ErrorCode::NotFound, format!("插件 {id} 未安装")))?;
        if row.bundled {
            return Err(AppError::coded(
                ErrorCode::Perm,
                "内置插件不允许卸载（可禁用）",
            ));
        }
        let plugin_dir = self.plugins_root.join(id);
        if plugin_dir.exists() {
            fs::remove_dir_all(&plugin_dir)?;
        }
        self.database.delete_installed_plugin(id)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn current_version_path(&self, id: &str) -> AppResult<Option<PathBuf>> {
        let current = self.plugins_root.join(id).join("current.txt");
        if !current.exists() {
            return Ok(None);
        }
        let version = fs::read_to_string(&current)?.trim().to_string();
        if version.is_empty() {
            return Ok(None);
        }
        Ok(Some(self.plugins_root.join(id).join(version)))
    }
}

fn sha256_hex(path: &Path) -> AppResult<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn unzip(archive: &Path, target: &Path) -> AppResult<()> {
    let file = fs::File::open(archive)
        .map_err(|e| AppError::coded(ErrorCode::Io, format!("无法打开插件包：{e}")))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| AppError::coded(ErrorCode::Decompress, format!("插件包不是合法 zip：{e}")))?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| AppError::coded(ErrorCode::Decompress, format!("解压失败：{e}")))?;
        // Protect against zip-slip by inspecting the raw name for absolute paths
        // and `..` traversal before joining onto `target`.
        let raw_name = entry.name().to_string();
        if is_unsafe_zip_path(&raw_name) {
            return Err(AppError::coded(
                ErrorCode::Decompress,
                format!("插件包包含非法路径：{raw_name}"),
            ));
        }
        let candidate = target.join(&raw_name);
        if entry.is_dir() {
            fs::create_dir_all(&candidate)?;
            continue;
        }
        if let Some(parent) = candidate.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = fs::File::create(&candidate)?;
        io::copy(&mut entry, &mut out)?;
        out.flush()?;
    }
    Ok(())
}

fn is_unsafe_zip_path(name: &str) -> bool {
    if name.starts_with('/') || name.starts_with('\\') {
        return true;
    }
    if name.contains(":") {
        return true;
    }
    for component in name.split(['/', '\\']) {
        if component == ".." {
            return true;
        }
    }
    false
}

fn move_dir(src: &Path, dst: &Path) -> AppResult<()> {
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    // Cross-device fallback: copy then remove.
    copy_dir(src, dst)?;
    fs::remove_dir_all(src)?;
    Ok(())
}

fn copy_dir(src: &Path, dst: &Path) -> AppResult<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &target)?;
        } else {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::FileOptions;

    fn write_zip(target: &Path, manifest: &str) {
        let f = fs::File::create(target).unwrap();
        let mut zw = zip::ZipWriter::new(f);
        let opts: FileOptions<()> = FileOptions::default();
        zw.start_file("tool.json", opts).unwrap();
        let mut bytes = manifest.as_bytes();
        std::io::copy(&mut bytes, &mut zw).unwrap();
        zw.finish().unwrap();
    }

    #[test]
    fn installs_local_package_without_signature() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::open(&tmp.path().join("toolbag.sqlite3")).expect("db");
        let plugins_root = tmp.path().join("plugins");
        let staging_root = tmp.path().join("staging");
        fs::create_dir_all(&plugins_root).unwrap();
        fs::create_dir_all(&staging_root).unwrap();

        let manifest = r#"{
  "id": "com.lfen.toolbag.example",
  "name": "示例",
  "version": "1.0.0",
  "category": "实用",
  "description": "demo",
  "riskLevel": "safe",
  "runtime": { "kind": "none" }
}"#;
        let pkg = tmp.path().join("example.tbpkg");
        write_zip(&pkg, manifest);

        let installer = Installer {
            plugins_root: &plugins_root,
            staging_root: &staging_root,
            app_version: "0.2.0",
            database: &db,
        };
        let installed = installer
            .install(InstallSource {
                package_path: pkg,
                signature_path: None,
                source_url: "local://".to_string(),
                expected_sha256: None,
            })
            .expect("install");
        assert_eq!(installed.id, "com.lfen.toolbag.example");
        let rows = db.list_installed_plugins().unwrap();
        assert_eq!(rows.len(), 1);
        let dir = installer
            .current_version_path("com.lfen.toolbag.example")
            .unwrap()
            .unwrap();
        assert!(dir.join("tool.json").exists());
    }
}
