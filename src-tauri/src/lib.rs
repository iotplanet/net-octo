mod network_cat;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(network_cat::SessionRegistry::default())
        .invoke_handler(tauri::generate_handler![
            network_cat::nc_start_session,
            network_cat::nc_stop_session,
            network_cat::nc_stop_server,
            network_cat::nc_send,
            network_cat::nc_disconnect,
            network_cat::nc_reset_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
