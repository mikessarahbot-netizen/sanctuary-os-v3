use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{Manager, RunEvent};

/// Holds the spawned Presenter replay sidecar process so it can be terminated
/// when the app exits.
struct PresenterSidecarProcess(Mutex<Option<Child>>);

/// Spawn the Node Presenter replay sidecar unless disabled.
///
/// The sidecar is the bundled `dist/presenter-sidecar.mjs`. Its path is provided
/// via `SANCTUARY_OS_PRESENTER_SIDECAR_PATH`; spawning is skipped when that is
/// unset or when `SANCTUARY_OS_PRESENTER_SIDECAR_DISABLED` is set (e.g. CI), so
/// the shell still runs without the sidecar. The sidecar reads its own config
/// from the environment this process passes through.
fn spawn_presenter_sidecar() -> Option<Child> {
    if std::env::var("SANCTUARY_OS_PRESENTER_SIDECAR_DISABLED").is_ok() {
        return None;
    }

    let sidecar_path = std::env::var("SANCTUARY_OS_PRESENTER_SIDECAR_PATH").ok()?;

    match Command::new("node").arg(&sidecar_path).spawn() {
        Ok(child) => {
            log::info!("Spawned Presenter replay sidecar: {sidecar_path}");
            Some(child)
        }
        Err(error) => {
            log::error!("Failed to spawn Presenter replay sidecar: {error}");
            None
        }
    }
}

fn terminate_presenter_sidecar(handle: &tauri::AppHandle) {
    if let Some(state) = handle.try_state::<PresenterSidecarProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            app.manage(PresenterSidecarProcess(Mutex::new(spawn_presenter_sidecar())));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                terminate_presenter_sidecar(handle);
            }
        });
}
