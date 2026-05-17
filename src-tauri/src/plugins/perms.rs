//! Plugin permission helpers.

use std::collections::HashSet;

pub const ALL_PERMS: &[&str] = &[
    "fs.read",
    "fs.write",
    "net",
    "shell",
    "registry",
    "process.list",
    "services.read",
];

pub fn is_known(perm: &str) -> bool {
    ALL_PERMS.contains(&perm)
}

pub fn validate_set(perms: &[String]) -> Vec<String> {
    perms
        .iter()
        .filter(|p| is_known(p))
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect()
}
