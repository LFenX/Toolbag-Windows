//! Plugin system.
//!
//! Toolbag plugins are versioned packages installed at runtime. Each plugin declares a
//! [`PluginManifest`] (`tool.json`) and an optional UI schema (`ui.json`). Plugins ship in
//! one of three runtime flavours:
//!
//! - `builtin` — rendered by a React component compiled into the app shell.
//! - `sidecar` — a native child process the app spawns and pipes NDJSON RPC to.
//! - `none` — no native code; the UI schema alone drives the experience
//!   (e.g. text transformers handled by frontend helpers).
//!
//! See `docs/plan-v0.2-plugin-system.md` for the design.

pub mod builtin;
pub mod installer;
pub mod manifest;
pub mod perms;
pub mod registry;
pub mod runner;
pub mod signature;
pub mod store;

pub use store::PluginStore;
