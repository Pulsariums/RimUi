use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use tauri::{AppHandle, Emitter};
use crate::mod_engine::xml_parser::parse_mods_config_xml;

/// RimSort Watchdog mantığı: ModsConfig.xml dosyasını izler,
/// değişiklik olduğunda Tauri event'i fırlatır.
/// 
/// # Arguments
/// * `app_handle` - Tauri AppHandle, event fırlatmak için.
/// * `config_path` - İzlenecek ModsConfig.xml dosya yolu.
pub fn start_mods_config_watcher(app_handle: AppHandle, config_path: String) -> Result<(), String> {
    if !Path::new(&config_path).exists() {
        return Err(format!("ModsConfig.xml bulunamadı: {}", config_path));
    }

    // Watcher'ı arka planda çalıştıracak thread
    // config_path'i clone'la ve move et (lifetime için)
    let watching = Arc::new(AtomicBool::new(true));
    let watching_clone = watching.clone();

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Result<Event, notify::Error>>();

        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("fs_watcher başlatılamadı: {}", e);
                return;
            }
        };

        // Sadece belirtilen dosyayı değil, Config klasörünü izle
        // (çünkü RimWorld atomic write ile yazar, bazen temp dosyası oluşur)
        let watch_path = Path::new(&config_path);
        let watch_dir = watch_path.parent().unwrap_or(watch_path);
        if let Err(e) = watcher.watch(watch_dir, RecursiveMode::NonRecursive) {
            eprintln!("fs_watcher: dizin izlenemiyor {}: {}", watch_dir.display(), e);
            return;
        }

        // İlk başta bir kere oku ve event fırlat
        let _ = notify_mods_config_changed(&app_handle, &config_path);

        // Değişiklikleri dinle
        while watching_clone.load(Ordering::Relaxed) {
            match rx.recv() {
                Ok(Ok(event)) => {
                    // Sadece ModsConfig.xml ile ilgili değişikliklere tepki ver
                    let is_relevant = matches!(&event.kind, 
                        EventKind::Modify(_) | EventKind::Create(_)
                    ) && event.paths.iter().any(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n == "ModsConfig.xml" || n == "ModsConfig.xml.tmp")
                            .unwrap_or(false)
                    });

                    if is_relevant {
                        // Kısa bir bekleme (RimWorld'ün atomic write'ı tamamlaması için)
                        thread::sleep(std::time::Duration::from_millis(200));
                        let _ = notify_mods_config_changed(&app_handle, &config_path);
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("fs_watcher hatası: {}", e);
                }
                Err(mpsc::RecvError) => {
                    eprintln!("fs_watcher: kanal kapandı");
                    break;
                }
            }
        }

        let _ = watcher.unwatch(watch_dir);
    });

    Ok(())
}

/// ModsConfig.xml'i yeniden okur ve değişiklikleri frontend'e event olarak fırlatır.
fn notify_mods_config_changed(app_handle: &AppHandle, config_path: &str) -> Result<(), String> {
    match parse_mods_config_xml(config_path) {
        Ok(config) => {
            println!("fs_watcher: ModsConfig.xml değişti, event fırlatılıyor. Aktif mod: {}", config.active_mods.len());
            let _ = app_handle.emit("mods-config-changed", &config);
            Ok(())
        }
        Err(e) => {
            eprintln!("fs_watcher: ModsConfig.xml okunamadı: {}", e);
            Err(e)
        }
    }
}

/// Watcher'ı durdur.
#[allow(dead_code)]
pub fn stop_mods_config_watcher(watching: Arc<AtomicBool>) {
    watching.store(false, Ordering::Relaxed);
}
