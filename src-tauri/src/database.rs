use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension};

use crate::errors::{AppError, AppResult};
use crate::models::AppSettings;

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
        Ok(())
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
}
