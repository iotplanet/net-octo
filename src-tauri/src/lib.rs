mod network_cat;
mod shell;
mod tcp_client_link;
mod tls;

#[cfg(feature = "octo-db")]
mod octo_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(feature = "octo-db")]
    {
        builder = builder.manage(std::sync::Arc::new(octo_bridge::OctoBridge::default()));
    }
    builder
        .manage(network_cat::SessionRegistry::default())
        .invoke_handler(tauri::generate_handler![
            network_cat::nc_start_session,
            network_cat::nc_stop_session,
            network_cat::nc_stop_server,
            network_cat::nc_send,
            network_cat::nc_disconnect,
            network_cat::nc_reset_stats,
            network_cat::nc_list_interfaces,
            shell::nc_shell_ready,
            #[cfg(feature = "octo-db")]
            octo_bridge::nc_octo_enable,
            #[cfg(feature = "octo-db")]
            octo_bridge::nc_octo_disable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
