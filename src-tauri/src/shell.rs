//! Window visibility: main/settings webviews start hidden (`visible: false`) until the
//! frontend calls `nc_shell_ready` after the first themed paint.

use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn nc_shell_ready(app: AppHandle, webview_label: String) -> Result<(), String> {
    let win = app
        .get_webview_window(&webview_label)
        .ok_or_else(|| format!("webview not found: {webview_label}"))?;
    win.show().map_err(|e| e.to_string())?;
    Ok(())
}
