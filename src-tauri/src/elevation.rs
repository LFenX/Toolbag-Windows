//! Elevation helpers for Windows UAC.

/// Returns true if the current process is running with administrator privileges.
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        extern "system" {
            fn IsUserAnAdmin() -> i32;
        }
        unsafe { IsUserAnAdmin() != 0 }
    }
    #[cfg(not(windows))]
    false
}

/// Re-launches the current executable with the "runas" verb to trigger a UAC prompt.
/// Returns Ok(true) if ShellExecuteW reported success (> 32), Ok(false) otherwise.
pub fn relaunch_as_admin() -> std::io::Result<bool> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let exe = std::env::current_exe()?;
        let exe_wide: Vec<u16> = exe.as_os_str().encode_wide().chain([0u16]).collect();
        let verb: Vec<u16> = OsStr::new("runas").encode_wide().chain([0u16]).collect();

        extern "system" {
            fn ShellExecuteW(
                hwnd: *mut core::ffi::c_void,
                op: *const u16,
                file: *const u16,
                params: *const u16,
                dir: *const u16,
                show: i32,
            ) -> isize;
        }
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                exe_wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            )
        };
        Ok(result as usize > 32)
    }
    #[cfg(not(windows))]
    Ok(false)
}
