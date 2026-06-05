//! Optional Octo-DB edge storage: feed raw session bytes into EdgePipeline.

use std::sync::{Arc, Mutex};

use octo_db::{EdgeDbConfig, EdgePipeline};

pub struct OctoBridge {
    inner: Mutex<Option<EdgePipeline>>,
}

impl Default for OctoBridge {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

impl OctoBridge {
    pub fn enable(&self, data_dir: String, device_id: String) -> Result<(), String> {
        let mut g = self.inner.lock().map_err(|e| e.to_string())?;
        let pipe = EdgePipeline::open(
            EdgeDbConfig::tiny().data_dir(data_dir),
            device_id,
        )
        .map_err(|e| e.to_string())?;
        *g = Some(pipe);
        Ok(())
    }

    pub fn disable(&self) {
        if let Ok(mut g) = self.inner.lock() {
            *g = None;
        }
    }

    pub fn feed(&self, chunk: &[u8]) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(pipe) = g.as_mut() {
                let _ = pipe.on_bytes(chunk);
            }
        }
    }
}

pub type SharedOctoBridge = Arc<OctoBridge>;

#[tauri::command]
pub fn nc_octo_enable(
    bridge: tauri::State<'_, SharedOctoBridge>,
    data_dir: String,
    device_id: String,
) -> Result<(), String> {
    bridge.enable(data_dir, device_id)
}

#[tauri::command]
pub fn nc_octo_disable(bridge: tauri::State<'_, SharedOctoBridge>) -> Result<(), String> {
    bridge.disable();
    Ok(())
}
