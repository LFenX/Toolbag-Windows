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
            Some(value) => Ok(serde_json::from_str(&value)?),
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

    pub fn record_tool_run(
        &self,
        tool_id: &str,
        status: LastResult,
        duration_ms: Option<u128>,
        message: Option<&str>,
    ) -> AppResult<()> {
        let duration_ms = duration_ms.map(|value| value.min(i64::MAX as u128) as i64);
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO tool_runs (tool_id, status, duration_ms, message)
             VALUES (?1, ?2, ?3, ?4)",
            params![tool_id, status.as_str(), duration_ms, message],
        )?;
        Ok(())
    }

    pub fn tool_run_summary(&self, tool_id: &str) -> AppResult<ToolRunSummary> {
        let connection = self.connection()?;
        let (run_count, average_duration_ms): (i64, Option<f64>) = connection.query_row(
            "SELECT COUNT(*), AVG(duration_ms) FROM tool_runs WHERE tool_id = ?1",
            params![tool_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let last_run: Option<(String, String)> = connection
            .query_row(
                "SELECT status, created_at
                 FROM tool_runs
                 WHERE tool_id = ?1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1",
                params![tool_id],
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_schema_and_default_settings() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database = Database::open(&temp_dir.path().join("toolbag.sqlite3")).expect("database");

        let settings = database.get_settings().expect("settings");

        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn persists_settings() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database = Database::open(&temp_dir.path().join("toolbag.sqlite3")).expect("database");
        let settings = AppSettings {
            favorite_tool_ids: vec!["environment-overview".to_string()],
            auto_check_updates: false,
            launch_at_startup: true,
            telemetry_enabled: false,
        };

        database.save_settings(&settings).expect("save settings");

        assert_eq!(database.get_settings().expect("settings"), settings);
    }

    #[test]
    fn reads_legacy_settings_with_missing_fields() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database = Database::open(&temp_dir.path().join("toolbag.sqlite3")).expect("database");
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

        assert_eq!(
            database.get_settings().expect("settings"),
            AppSettings::default()
        );
    }

    #[test]
    fn records_tool_runs_and_builds_summary() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database = Database::open(&temp_dir.path().join("toolbag.sqlite3")).expect("database");

        database
            .record_tool_run("environment-overview", LastResult::Success, Some(100), None)
            .expect("first run");
        database
            .record_tool_run(
                "environment-overview",
                LastResult::Cancelled,
                Some(300),
                Some("stop"),
            )
            .expect("second run");

        let summary = database
            .tool_run_summary("environment-overview")
            .expect("summary");

        assert_eq!(summary.run_count, 2);
        assert_eq!(summary.average_duration_ms, Some(200));
        assert_eq!(summary.last_result, LastResult::Cancelled);
        assert!(summary.last_run_at.is_some());
    }
}
