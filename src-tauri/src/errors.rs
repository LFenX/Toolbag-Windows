use serde::Serialize;
use thiserror::Error;

/// Stable, machine-readable error codes returned to the frontend.
/// Frontend uses these to render localised messages and choose retry / open-settings actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[allow(dead_code)]
pub enum ErrorCode {
    Internal,
    NotFound,
    Busy,
    Network,
    Sig,
    Hash,
    Ver,
    Perm,
    Decompress,
    Manifest,
    Protocol,
    Cancelled,
    Io,
    Db,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::Internal => "E_INTERNAL",
            ErrorCode::NotFound => "E_NOT_FOUND",
            ErrorCode::Busy => "E_BUSY",
            ErrorCode::Network => "E_NETWORK",
            ErrorCode::Sig => "E_SIG",
            ErrorCode::Hash => "E_HASH",
            ErrorCode::Ver => "E_VER",
            ErrorCode::Perm => "E_PERM",
            ErrorCode::Decompress => "E_DECOMPRESS",
            ErrorCode::Manifest => "E_MANIFEST",
            ErrorCode::Protocol => "E_PROTOCOL",
            ErrorCode::Cancelled => "E_CANCELLED",
            ErrorCode::Io => "E_IO",
            ErrorCode::Db => "E_DB",
        }
    }
}

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
    #[error("{message}")]
    Coded { code: ErrorCode, message: String },
    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn coded(code: ErrorCode, message: impl Into<String>) -> Self {
        AppError::Coded {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> ErrorCode {
        match self {
            AppError::Io(_) => ErrorCode::Io,
            AppError::Database(_) => ErrorCode::Db,
            AppError::Serde(_) => ErrorCode::Manifest,
            AppError::Time(_) => ErrorCode::Internal,
            AppError::TauriPath(_) => ErrorCode::Internal,
            AppError::Coded { code, .. } => *code,
            AppError::Message(_) => ErrorCode::Internal,
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code().as_str())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_error_as_code_and_message() {
        let error = AppError::coded(ErrorCode::Sig, "签名校验失败");
        let serialized = serde_json::to_string(&error).expect("serialized error");

        assert!(serialized.contains("\"code\":\"E_SIG\""));
        assert!(serialized.contains("签名校验失败"));
    }

    #[test]
    fn maps_underlying_errors_to_codes() {
        let io = AppError::Io(std::io::Error::other("disk"));
        assert_eq!(io.code(), ErrorCode::Io);
    }
}
