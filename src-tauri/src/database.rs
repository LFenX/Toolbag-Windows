use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension};

use crate::errors::{AppError, AppResult};
use crate::models::{AppSettings, LastResult, ToolRunSummary};

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        let connection = Connection::open(path)?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let connection = self.connection()?;
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'default'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        match value {
            Some(value) => {
                // Best-effort parse: missing fields fall back to defaults.
                let parsed: serde_json::Value = serde_json::from_str(&value)?;
                let defaults = serde_json::to_value(AppSettings::default())?;
                let merged = merge_with_defaults(defaults, parsed);
                Ok(serde_json::from_value(merged)?)
            }
            None => {
                let settings = AppSettings::default();
                drop(connection);
                self.save_settings(&settings)?;
                Ok(settings)
            }
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        let value = serde_json::to_string(settings)?;
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES ('default', ?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at",
            params![value],
        )?;
        Ok(())
    }

    pub fn record_plugin_run(
        &self,
        plugin_id: &str,
        command_id: &str,
        status: LastResult,
        duration_ms: Option<u128>,
        message: Option<&str>,
    ) -> AppResult<()> {
        let duration_ms = duration_ms.map(|value| value.min(i64::MAX as u128) as i64);
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO plugin_runs (plugin_id, command_id, status, duration_ms, message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![plugin_id, command_id, status.as_str(), duration_ms, message],
        )?;
        Ok(())
    }

    pub fn plugin_run_summary(&self, plugin_id: &str) -> AppResult<ToolRunSummary> {
        let connection = self.connection()?;
        let (run_count, average_duration_ms): (i64, Option<f64>) = connection.query_row(
            "SELECT COUNT(*), AVG(duration_ms) FROM plugin_runs WHERE plugin_id = ?1",
            params![plugin_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let last_run: Option<(String, String)> = connection
            .query_row(
                "SELECT status, created_at
                 FROM plugin_runs
                 WHERE plugin_id = ?1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1",
                params![plugin_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let Some((status, created_at)) = last_run else {
            return Ok(ToolRunSummary::default());
        };

        Ok(ToolRunSummary {
            last_run_at: Some(created_at),
            run_count: run_count.max(0).min(u32::MAX as i64) as u32,
            average_duration_ms: average_duration_ms.map(|value| value.round().max(0.0) as u64),
            last_result: LastResult::from_str(&status).unwrap_or(LastResult::Failed),
        })
    }

    pub fn upsert_installed_plugin(&self, record: &InstalledPluginRow) -> AppResult<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO installed_plugins (id, current_version, installed_at, updated_at, source, source_url, bundled, disabled, granted_perms)
             VALUES (?1, ?2, COALESCE((SELECT installed_at FROM installed_plugins WHERE id = ?1), strftime('%Y-%m-%dT%H:%M:%fZ','now')), strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                current_version = excluded.current_version,
                updated_at = excluded.updated_at,
                source = excluded.source,
                source_url = excluded.source_url,
                bundled = excluded.bundled,
                disabled = CASE WHEN excluded.bundled = 1 THEN 0 ELSE installed_plugins.disabled END,
                granted_perms = excluded.granted_perms",
            params![
                record.id,
                record.current_version,
                record.source,
                record.source_url,
                record.bundled as i64,
                record.disabled as i64,
                serde_json::to_string(&record.granted_perms)?,
            ],
        )?;
        Ok(())
    }

    pub fn list_installed_plugins(&self) -> AppResult<Vec<InstalledPluginRow>> {
        let connection = self.connection()?;
        let mut stmt = connection.prepare(
            "SELECT id, current_version, installed_at, updated_at, source, source_url, bundled, disabled, granted_perms FROM installed_plugins ORDER BY id ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                let granted: String = row.get(8)?;
                Ok(InstalledPluginRow {
                    id: row.get(0)?,
                    current_version: row.get(1)?,
                    installed_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    source: row.get(4)?,
                    source_url: row.get(5)?,
                    bundled: row.get::<_, i64>(6)? != 0,
                    disabled: row.get::<_, i64>(7)? != 0,
                    granted_perms: serde_json::from_str(&granted).unwrap_or_default(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_installed_plugin(&self, id: &str) -> AppResult<Option<InstalledPluginRow>> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT id, current_version, installed_at, updated_at, source, source_url, bundled, disabled, granted_perms
                 FROM installed_plugins WHERE id = ?1",
                params![id],
                |row| {
                    let granted: String = row.get(8)?;
                    Ok(InstalledPluginRow {
                        id: row.get(0)?,
                        current_version: row.get(1)?,
                        installed_at: row.get(2)?,
                        updated_at: row.get(3)?,
                        source: row.get(4)?,
                        source_url: row.get(5)?,
                        bundled: row.get::<_, i64>(6)? != 0,
                        disabled: row.get::<_, i64>(7)? != 0,
                        granted_perms: serde_json::from_str(&granted).unwrap_or_default(),
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn delete_installed_plugin(&self, id: &str) -> AppResult<()> {
        let connection = self.connection()?;
        connection.execute("DELETE FROM installed_plugins WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_plugin_disabled(&self, id: &str, disabled: bool) -> AppResult<()> {
        let connection = self.connection()?;
        connection.execute(
            "UPDATE installed_plugins SET disabled = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![id, disabled as i64],
        )?;
        Ok(())
    }

    pub fn set_plugin_perms(&self, id: &str, perms: &[String]) -> AppResult<()> {
        let connection = self.connection()?;
        let value = serde_json::to_string(perms)?;
        connection.execute(
            "UPDATE installed_plugins SET granted_perms = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![id, value],
        )?;
        Ok(())
    }

    pub fn get_registry_cache(&self, url: &str) -> AppResult<Option<RegistryCacheRow>> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT url, etag, body, fetched_at FROM registry_cache WHERE url = ?1",
                params![url],
                |row| {
                    Ok(RegistryCacheRow {
                        url: row.get(0)?,
                        etag: row.get(1)?,
                        body: row.get(2)?,
                        fetched_at: row.get(3)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn put_registry_cache(&self, row: &RegistryCacheRow) -> AppResult<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO registry_cache (url, etag, body, fetched_at)
             VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             ON CONFLICT(url) DO UPDATE SET etag = excluded.etag, body = excluded.body, fetched_at = excluded.fetched_at",
            params![row.url, row.etag, row.body],
        )?;
        Ok(())
    }

    fn migrate(&self) -> AppResult<()> {
        let connection = self.connection()?;
        connection.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tool_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool_id TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER,
                message TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );

            INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
            ",
        )?;

        if !Self::column_exists(&connection, "tool_runs", "duration_ms")? {
            connection.execute("ALTER TABLE tool_runs ADD COLUMN duration_ms INTEGER", [])?;
        }
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)",
            [],
        )?;

        // v3: plugin system tables.
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS installed_plugins (
                id              TEXT PRIMARY KEY,
                current_version TEXT NOT NULL,
                installed_at    TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                source          TEXT NOT NULL DEFAULT 'bundled',
                source_url      TEXT NOT NULL DEFAULT '',
                bundled         INTEGER NOT NULL DEFAULT 0,
                disabled        INTEGER NOT NULL DEFAULT 0,
                granted_perms   TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS plugin_runs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                plugin_id    TEXT NOT NULL,
                command_id   TEXT NOT NULL DEFAULT '',
                status       TEXT NOT NULL,
                duration_ms  INTEGER,
                message      TEXT,
                created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );
            CREATE INDEX IF NOT EXISTS idx_plugin_runs_plugin_id ON plugin_runs(plugin_id);
            CREATE INDEX IF NOT EXISTS idx_tool_runs_tool_id ON tool_runs(tool_id);

            CREATE TABLE IF NOT EXISTS registry_cache (
                url        TEXT PRIMARY KEY,
                etag       TEXT,
                body       TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            );
            ",
        )?;

        // One-shot copy of legacy tool_runs into plugin_runs; we leave the old table for backups
        // but read from plugin_runs going forward.
        let already_migrated: i64 = connection.query_row(
            "SELECT COUNT(*) FROM plugin_runs WHERE command_id = '__legacy__'",
            [],
            |row| row.get(0),
        )?;
        if already_migrated == 0 {
            connection.execute(
                "INSERT INTO plugin_runs (plugin_id, command_id, status, duration_ms, message, created_at)
                 SELECT
                    CASE WHEN tool_id = 'environment-overview' THEN 'com.lfen.toolbag.environment-overview' ELSE tool_id END,
                    '__legacy__', status, duration_ms, message, created_at
                 FROM tool_runs",
                [],
            )?;
        }

        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (3)",
            [],
        )?;
        Ok(())
    }

    fn column_exists(
        connection: &Connection,
        table_name: &str,
        column_name: &str,
    ) -> AppResult<bool> {
        let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let name: String = row.get(1)?;
            if name == column_name {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn connection(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|error| AppError::Message(format!("database lock poisoned: {error}")))
    }
}

#[derive(Debug, Clone)]
pub struct InstalledPluginRow {
    pub id: String,
    pub current_version: String,
    #[allow(dead_code)]
    pub installed_at: String,
    #[allow(dead_code)]
    pub updated_at: String,
    pub source: String,
    pub source_url: String,
    pub bundled: bool,
    pub disabled: bool,
    pub granted_perms: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RegistryCacheRow {
    pub url: String,
    pub etag: Option<String>,
    pub body: String,
    #[allow(dead_code)]
    pub fetched_at: String,
}

fn merge_with_defaults(
    defaults: serde_json::Value,
    actual: serde_json::Value,
) -> serde_json::Value {
    match (defaults, actual) {
        (serde_json::Value::Object(mut d), serde_json::Value::Object(a)) => {
            for (k, v) in a {
                let next = match d.remove(&k) {
                    Some(existing) => merge_with_defaults(existing, v),
                    None => v,
                };
                d.insert(k, next);
            }
            serde_json::Value::Object(d)
        }
        (_, actual) => actual,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_temp() -> (Database, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database = Database::open(&temp_dir.path().join("toolbag.sqlite3")).expect("database");
        (database, temp_dir)
    }

    #[test]
    fn creates_schema_and_default_settings() {
        let (database, _t) = open_temp();
        let settings = database.get_settings().expect("settings");

        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn persists_settings() {
        let (database, _t) = open_temp();
        let settings = AppSettings {
            favorite_tool_ids: vec!["com.lfen.toolbag.environment-overview".to_string()],
            app_auto_update: false,
            ..AppSettings::default()
        };

        database.save_settings(&settings).expect("save");
        assert_eq!(database.get_settings().expect("settings"), settings);
    }

    #[test]
    fn reads_legacy_settings_with_missing_fields() {
        let (database, _t) = open_temp();
        {
            let connection = database.connection().expect("connection");
            connection
                .execute(
                    "INSERT INTO app_settings (key, value, updated_at)
                     VALUES ('default', '{\"favoriteToolIds\":[\"environment-overview\"]}', 'now')
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [],
                )
                .expect("legacy settings");
        }

        let s = database.get_settings().expect("settings");
        assert_eq!(
            s.favorite_tool_ids,
            vec!["environment-overview".to_string()]
        );
        // Missing fields fall back to defaults.
        assert_eq!(s.theme, AppSettings::default().theme);
    }

    #[test]
    fn records_plugin_runs_and_builds_summary() {
        let (database, _t) = open_temp();

        database
            .record_plugin_run(
                "com.lfen.toolbag.environment-overview",
                "scan",
                LastResult::Success,
                Some(100),
                None,
            )
            .expect("first run");
        database
            .record_plugin_run(
                "com.lfen.toolbag.environment-overview",
                "scan",
                LastResult::Cancelled,
                Some(300),
                Some("stop"),
            )
            .expect("second run");

        let summary = database
            .plugin_run_summary("com.lfen.toolbag.environment-overview")
            .expect("summary");

        assert_eq!(summary.run_count, 2);
        assert_eq!(summary.average_duration_ms, Some(200));
        assert_eq!(summary.last_result, LastResult::Cancelled);
        assert!(summary.last_run_at.is_some());
    }

    #[test]
    fn upserts_installed_plugins() {
        let (database, _t) = open_temp();
        let row = InstalledPluginRow {
            id: "com.lfen.toolbag.environment-overview".to_string(),
            current_version: "1.0.0".to_string(),
            installed_at: String::new(),
            updated_at: String::new(),
            source: "bundled".to_string(),
            source_url: String::new(),
            bundled: true,
            disabled: false,
            granted_perms: vec![],
        };
        database.upsert_installed_plugin(&row).expect("insert");
        let installed = database.list_installed_plugins().expect("list");
        assert_eq!(installed.len(), 1);
        assert!(installed[0].bundled);
    }
}
