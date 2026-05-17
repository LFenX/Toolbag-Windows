//! Plugin package signature verification (minisign).
//!
//! The application carries a hard-coded `TRUSTED_PUBKEY`. When that constant is empty
//! (development builds), verification is skipped — and the host emits a warning. Release
//! builds set the pubkey via the `TOOLBAG_PLUGIN_PUBKEY` env var at compile time.

use std::path::Path;

use minisign_verify::{Error as MinisignError, PublicKey, Signature};
use sha2::{Digest, Sha256};

use crate::errors::{AppError, AppResult, ErrorCode};

/// Embedded at build time. Empty means signatures aren't enforced.
pub const TRUSTED_PUBKEY: &str = match option_env!("TOOLBAG_PLUGIN_PUBKEY") {
    Some(v) => v,
    None => "",
};

pub fn is_enforced() -> bool {
    !TRUSTED_PUBKEY.trim().is_empty()
}

pub fn pubkey_fingerprint() -> Option<String> {
    if !is_enforced() {
        return None;
    }
    // minisign-verify keeps the key id private, so we expose a stable SHA-256
    // fingerprint of the encoded public key text instead.
    let mut hasher = Sha256::new();
    hasher.update(TRUSTED_PUBKEY.trim().as_bytes());
    Some(hex::encode(hasher.finalize()))
}

pub fn verify_file(package: &Path, signature_text: &str) -> AppResult<()> {
    if !is_enforced() {
        log::warn!("plugin signature verification skipped (no TRUSTED_PUBKEY)");
        return Ok(());
    }
    let pubkey = decode_public_key_text(TRUSTED_PUBKEY)
        .map_err(|e| AppError::coded(ErrorCode::Sig, format!("内置公钥不合法：{e}")))?;
    let signature = Signature::decode(signature_text)
        .map_err(|e| AppError::coded(ErrorCode::Sig, format!("签名格式不合法：{e}")))?;
    let bytes = std::fs::read(package)
        .map_err(|e| AppError::coded(ErrorCode::Io, format!("无法读取插件包：{e}")))?;
    pubkey
        .verify(&bytes, &signature, false)
        .map_err(|e| AppError::coded(ErrorCode::Sig, format!("签名校验失败：{e}")))?;
    Ok(())
}

fn decode_public_key_text(text: &str) -> Result<PublicKey, MinisignError> {
    let trimmed = text.trim();
    PublicKey::decode(trimmed).or_else(|_| PublicKey::from_base64(trimmed))
}

#[cfg(test)]
mod tests {
    use super::decode_public_key_text;

    const RAW_KEY: &str = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const PUB_FILE: &str = "untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";

    #[test]
    fn accepts_minisign_pub_file_text() {
        decode_public_key_text(PUB_FILE).expect("pub file format");
    }

    #[test]
    fn accepts_raw_base64_public_key() {
        decode_public_key_text(RAW_KEY).expect("raw key format");
    }
}
