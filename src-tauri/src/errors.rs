use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("time formatting error: {0}")]
    Time(#[from] time::error::Format),
    #[error("tauri path error: {0}")]
    TauriPath(#[from] tauri::Error),
    #[error("{0}")]
    Message(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_error_as_user_safe_message() {
        let error = AppError::Message("something went wrong".to_string());
        let serialized = serde_json::to_string(&error).expect("serialized error");

        assert_eq!(serialized, "\"something went wrong\"");
    }
}
