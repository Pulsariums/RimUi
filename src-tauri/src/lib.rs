pub mod data_store;
pub mod mod_engine;
pub mod steamcmd;
pub mod steamworks_dl;
pub mod workshop;

use data_store::cache::CacheEngine;
use data_store::profile::{ModProfile, ProfileStore};
use mod_engine::xml_parser::{parse_mods_config_xml, ModMetadata, ModsConfig};
use mod_engine::sorter::{ultimate_sort, CommunityRules};
use mod_engine::orchestrator::write_mods_config_atomic;
use mod_engine::fs_watcher::start_mods_config_watcher;

use steamcmd::SteamCmdManager;
use workshop::{WorkshopDetails, WorkshopItem};

#[derive(serde::Serialize)]
pub struct DetectedPaths {
    pub mods_path: Option<String>,
    pub config_path: Option<String>,
    pub executable_path: Option<String>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ImportExportData {
    pub rimworld_mods_path: String,
    pub rimworld_config_path: String,
    pub db_path: String,
    pub profiles: Vec<ModProfile>,
}

#[tauri::command]
fn system_check() -> String {
    println!("System check requested");
    "ready".to_string()
}

#[tauri::command]
async fn export_app_data(path: String, data: ImportExportData) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::create(&path).map_err(|e| format!("Dosya oluşturulamadı: {}", e))?;
        serde_json::to_writer_pretty(file, &data).map_err(|e| format!("JSON yazılamadı: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn import_app_data(path: String) -> Result<ImportExportData, String> {
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&path).map_err(|e| format!("Dosya açılamadı: {}", e))?;
        let data: ImportExportData = serde_json::from_reader(file).map_err(|e| format!("JSON okunamadı: {}", e))?;
        Ok(data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    let p = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::read_to_string(&p).map_err(|e| format!("Dosya okunamadı '{}': {}", p, e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = path.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::write(&p, content).map_err(|e| format!("Dosya yazılamadı '{}': {}", p, e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
fn detect_rimworld_paths() -> DetectedPaths {
    let mut detected = DetectedPaths {
        mods_path: None,
        config_path: None,
        executable_path: None,
    };

    // 1. Detect ModsConfig.xml path
    if let Some(local_low) = std::env::var_os("USERPROFILE") {
        let user_profile = std::path::Path::new(&local_low);
        let path1 = user_profile.join("AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml");
        if path1.exists() {
            detected.config_path = Some(path1.to_string_lossy().into_owned());
        }
    }

    // 2. Detect Mods directory
    // Common Steam paths
    let common_steam_paths = vec![
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
        "C:\\Program Files\\Steam\\steamapps\\common\\RimWorld\\Mods",
        "D:\\SteamLibrary\\steamapps\\common\\RimWorld\\Mods",
        "E:\\SteamLibrary\\steamapps\\common\\RimWorld\\Mods",
        "F:\\SteamLibrary\\steamapps\\common\\RimWorld\\Mods",
    ];

    for path_str in common_steam_paths {
        let path = std::path::Path::new(path_str);
        if path.exists() {
            detected.mods_path = Some(path.to_string_lossy().into_owned());
            break;
        }
    }

    // 3. Detect Executable path
    // Try common paths based on mods_path
    if let Some(ref mods_p) = detected.mods_path {
        let mods_path_obj = std::path::Path::new(mods_p);
        // Usually Mods is in RimWorld/Mods, so exe is in RimWorld/RimWorldWin.exe
        if let Some(parent) = mods_path_obj.parent() {
            let exe_path = parent.join("RimWorldWin.exe");
            if exe_path.exists() {
                detected.executable_path = Some(exe_path.to_string_lossy().into_owned());
            }
        }
    }

    detected
}

/// Command to scan RimWorld mods. Uses the SQLite database cache under the hood.
#[tauri::command]
async fn scan_mods(mods_dir: String, db_path: String) -> Result<Vec<ModMetadata>, String> {
    tokio::task::spawn_blocking(move || {
        let engine = CacheEngine::new(&db_path)?;
        engine.scan_directory(&mods_dir)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Command to run the advanced community and topological sort.
#[tauri::command]
async fn sort_mods(
    mods: Vec<ModMetadata>,
    community_rules: Option<CommunityRules>,
) -> Result<Vec<ModMetadata>, String> {
    tokio::task::spawn_blocking(move || {
        ultimate_sort(mods, community_rules.as_ref())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Command to sort mods using RimSort 4-Tier + Kahn's Algorithm.
#[tauri::command]
fn sort_mods_rimworld(
    active_package_ids: Vec<String>,
    deps_graph: std::collections::HashMap<String, Vec<String>>,
    rev_deps_graph: std::collections::HashMap<String, Vec<String>>,
) -> Result<Vec<String>, String> {
    let active_set: std::collections::HashSet<String> = active_package_ids.into_iter().collect();
    crate::mod_engine::orchestrator::sort_rimworld_mods(&active_set, &deps_graph, &rev_deps_graph)
}

/// Command to read ModsConfig.xml.
/// RimSort mantığı: version, activeMods, knownExpansions hepsini döndürür.
#[tauri::command]
async fn read_mods_config(path: String) -> Result<ModsConfig, String> {
    tokio::task::spawn_blocking(move || {
        parse_mods_config_xml(&path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Command to write ModsConfig.xml active mods atomically.
#[tauri::command]
async fn save_mods_config(path: String, config: ModsConfig) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        write_mods_config_atomic(&path, &config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Command to load a mod profile from JSON.
#[tauri::command]
async fn load_profile(path: String) -> Result<ModProfile, String> {
    tokio::task::spawn_blocking(move || {
        ProfileStore::load_profile(&path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Command to save a mod profile to JSON.
#[tauri::command]
async fn save_profile(path: String, profile: ModProfile) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        ProfileStore::save_profile(&path, &profile)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
async fn launch_game(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        std::process::Command::new(path)
            .spawn()
            .map_err(|e| format!("Oyun başlatılamadı: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn workshop_search(query: String, page: u32, section: String, sort: String) -> Result<Vec<WorkshopItem>, String> {
    workshop::search_workshop(&query, page, &section, &sort).await
}

#[tauri::command]
async fn workshop_details(id: String) -> Result<WorkshopDetails, String> {
    workshop::get_workshop_details(&id).await
}

#[tauri::command]
async fn workshop_resolve(package_id: String, name: String) -> Result<String, String> {
    workshop::resolve_workshop_id(&package_id, &name).await
}

#[tauri::command]
async fn translate_text(text: String, target: String) -> Result<String, String> {
    workshop::translate_text(&text, &target).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // RimSort Watchdog: ModsConfig.xml değişikliklerini izle
            // Config yolunu detect_rimworld_paths mantığıyla bul
            if let Some(user_profile) = std::env::var_os("USERPROFILE") {
                let config_path = std::path::Path::new(&user_profile)
                    .join("AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml");
                if config_path.exists() {
                    let path_str = config_path.to_string_lossy().to_string();
                    let app_handle = app.handle().clone();
                    std::thread::spawn(move || {
                        if let Err(e) = start_mods_config_watcher(app_handle, path_str) {
                            eprintln!("ModsConfig.xml watcher başlatılamadı: {}", e);
                        }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system_check,
            scan_mods,
            scan_mods_from_path,
            sort_mods,
            sort_mods_rimworld,
            read_mods_config,
            save_mods_config,
            load_profile,
            save_profile,
            detect_rimworld_paths,
            export_app_data,
            import_app_data,
            read_text_file,
            write_text_file,
            check_steamcmd_installed,
            steamcmd_resolve,
            steamcmd_setup,
            steam_client_available,
            steam_download_mod,
            download_mod,
            update_mods,
            workshop_search,
            workshop_details,
            workshop_resolve,
            translate_text,
            validate_sorting,
            launch_game,
            delete_mod,
            move_mod_to_rimworld,
            clear_mods_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn delete_mod(mod_id: String, path: String) -> Result<(), String> {
    // Mod klasörünü settings'ten gelen mods dizininde ara (Steam/Heroic/özel yollar desteklenir).
    let mod_dir = std::path::Path::new(&path).join(&mod_id);
    if mod_dir.exists() && mod_dir.is_dir() {
        std::fs::remove_dir_all(&mod_dir)
            .map_err(|e| format!("Mod silinemedi '{}': {}", mod_id, e))?;
        return Ok(());
    }

    Err(format!(
        "Mod bulunamadı '{}' — belirtilen Mods dizininde mevcut değil: {}",
        mod_id, path
    ))
}

/// SQLite mod önbelleğini siler; bir sonraki taramada yeniden oluşturulur.
#[tauri::command]
async fn clear_mods_cache(db_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = std::path::Path::new(&db_path);
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| format!("Önbellek silinemedi: {}", e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
fn check_steamcmd_installed(path: String) -> bool {
   let manager = SteamCmdManager::new(path);
   manager.is_installed()
}

/// SteamCMD durumunu çözer: ok / found_elsewhere (onarılabilir) / missing
#[tauri::command]
fn steamcmd_resolve(configured_path: String) -> steamcmd::ResolveResult {
    steamcmd::resolve_steamcmd(&configured_path)
}

/// SteamCMD'yi tek tıkla indirip kurar (yönetilen klasöre). Yolu döndürür.
#[tauri::command]
async fn steamcmd_setup(window: tauri::Window) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        steamcmd::setup_steamcmd(&window).map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Steam client'ı şu an çalışıyor mu? (native indirme ön kontrolü)
#[tauri::command]
fn steam_client_available() -> bool {
    steamworks_dl::steam_running()
}

/// Steam client üzerinden workshop indirme (kullanıcının açık oturumuyla).
#[tauri::command]
async fn steam_download_mod(window: tauri::Window, install_dir: String, mod_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        steamworks_dl::download_mod(window, mod_id, install_dir)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn download_mod(window: tauri::Window, steamcmd_path: String, install_dir: String, mod_id: String) -> Result<String, String> {
   if install_dir.trim().is_empty() {
       return Err("RimWorld Mods klasörü ayarlı değil (Ayarlar → Yol).".into());
   }
   tokio::task::spawn_blocking(move || {
       // Ayar bozuk/eksikse: yönetilen → cihazda tespit → otomatik kurulum
       let exe = steamcmd::ensure_steamcmd(&window, &steamcmd_path)?;
       let manager = SteamCmdManager::new(exe.to_string_lossy().into_owned());
       manager.download_mod(window, mod_id, install_dir)
   })
   .await
   .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn update_mods(window: tauri::Window, steamcmd_path: String, install_dir: String, mod_ids: Vec<String>) -> Result<Vec<(String, bool)>, String> {
   tokio::task::spawn_blocking(move || {
       let manager = SteamCmdManager::new(steamcmd_path);
        manager.update_mods(mod_ids, window, install_dir)
   })
   .await
   .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn scan_mods_from_path(path: String) -> Result<Vec<ModMetadata>, String> {
    tokio::task::spawn_blocking(move || {
        let mods_dir = std::path::Path::new(&path);
        if !mods_dir.exists() || !mods_dir.is_dir() {
            return Err(format!("Klasör bulunamadı: {}", path));
        }

        let mut mods = Vec::new();

        // Klasör içindeki her alt klasörü tara
        for entry in std::fs::read_dir(mods_dir).map_err(|e| format!("Klasör okunamadı: {}", e))? {
            let entry = entry.map_err(|e| format!("Giriş okunamadı: {}", e))?;
            let entry_path = entry.path();

            if !entry_path.is_dir() {
                continue;
            }

            // About.xml dosyasını kontrol et
            let about_xml = entry_path.join("About").join("About.xml");
            if !about_xml.exists() {
                let about_xml2 = entry_path.join("About.xml");
                if !about_xml2.exists() {
                    continue;
                }
            }

            // ModMetadata'i About.xml'den parse et - quick-xml kullan
            let xml_path = if about_xml.exists() { about_xml } else { entry_path.join("About.xml") };
            match parse_mod_about_xml_quick(&xml_path, &entry_path) {
                Ok(meta) => mods.push(meta),
                Err(e) => eprintln!("Mod parse hatası {}: {}", entry_path.display(), e),
            }
        }

        Ok(mods)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Yardımcı: About.xml'den ModMetadata parse et (quick-xml ile)
fn parse_mod_about_xml_quick(xml_path: &std::path::Path, mod_dir: &std::path::Path) -> Result<ModMetadata, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let content = std::fs::read_to_string(xml_path).map_err(|e| format!("Dosya okunamadı: {}", e))?;
    let mut reader = Reader::from_str(&content);

    let mut package_id = String::new();
    let mut name = String::new();
    let mut author = String::new();
    let mut version = String::new();
    let mut description = String::new();
    let mut url = String::new();
    let mut supported_versions: Vec<String> = Vec::new();
    let mut dependencies: Vec<String> = Vec::new();

    // Preview görselini About/ klasöründen veya mod kökünden bul
    let preview_path = {
        let candidates = [
            mod_dir.join("About").join("Preview.png"),
            mod_dir.join("About").join("preview.png"),
            mod_dir.join("About").join("Preview.jpg"),
            mod_dir.join("About").join("preview.jpg"),
            mod_dir.join("About").join("Preview.jpeg"),
            mod_dir.join("About").join("preview.jpeg"),
            mod_dir.join("Preview.png"),
            mod_dir.join("preview.png"),
        ];
        candidates
            .iter()
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let mut current_tag = String::new();
    let mut in_supported_versions = false;
    let mut in_dependencies = false;
    let mut in_li = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "supportedVersions" => in_supported_versions = true,
                    "dependencies" | "modDependencies" => in_dependencies = true,
                    "li" => {
                        if in_dependencies {
                            in_li = true;
                        } else if in_supported_versions {
                            in_li = true;
                        }
                    }
                    _ => {
                        if !in_supported_versions && !in_dependencies {
                            current_tag = tag_name;
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                if in_li && in_supported_versions {
                    if !text.trim().is_empty() {
                        supported_versions.push(text.trim().to_string());
                    }
                } else if in_li && in_dependencies {
                    if !text.trim().is_empty() {
                        dependencies.push(text.trim().to_string());
                    }
                } else if !current_tag.is_empty() {
                    match current_tag.as_str() {
                        "packageId" => package_id = text,
                        "name" => name = text,
                        "author" => author = text,
                        "version" => version = text,
                        "description" => description = text,
                        "url" => url = text,
                        _ => {}
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "supportedVersions" => in_supported_versions = false,
                    "dependencies" | "modDependencies" => in_dependencies = false,
                    "li" => in_li = false,
                    _ => {
                        if !in_supported_versions && !in_dependencies {
                            current_tag.clear();
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML okuma hatası: {}", e)),
            _ => {}
        }
    }

    if package_id.is_empty() {
        // Klasör adını packageId olarak kullan
        let folder_name = mod_dir.file_name()
            .ok_or_else(|| "Geçersiz klasör adı".to_string())?
            .to_string_lossy()
            .to_string();
        return Ok(ModMetadata {
            package_id: folder_name,
            name: name.trim().to_string(),
            author: author.trim().to_string(),
            version: version.trim().to_string(),
            description: description.trim().to_string(),
            url: url.trim().to_string(),
            preview_path: preview_path.clone(),
            supported_versions,
            dependencies,
            load_before: Vec::new(),
            load_after: Vec::new(),
            dir_path: mod_dir.to_string_lossy().to_string(),
            is_dead: false,
            is_dlc: false,
            is_external: false,
        });
    }

    Ok(ModMetadata {
        package_id: package_id.trim().to_string(),
        name: name.trim().to_string(),
        author: author.trim().to_string(),
        version: version.trim().to_string(),
        description: description.trim().to_string(),
        url: url.trim().to_string(),
        preview_path: preview_path.clone(),
        supported_versions,
        dependencies,
        load_before: Vec::new(),
        load_after: Vec::new(),
        dir_path: mod_dir.to_string_lossy().to_string(),
        is_dead: false,
        is_dlc: false,
        is_external: false,
    })
}

#[tauri::command]
fn move_mod_to_rimworld(source_path: String, target_dir: String) -> Result<String, String> {
    let source = std::path::Path::new(&source_path);
    let target = std::path::Path::new(&target_dir);

    if !source.exists() {
        return Err(format!("Kaynak bulunamadı: {}", source_path));
    }

    let folder_name = source.file_name()
        .ok_or_else(|| "Geçersiz klasör adı".to_string())?;
    let destination = target.join(folder_name);

    // Hedefte zaten varsa çakışmayı bildir (sessizce üzerine yazma)
    if destination.exists() {
        return Err(format!(
            "Hedef zaten mevcut, üzerine yazılmadı: {}",
            destination.to_string_lossy()
        ));
    }

    // Taşı (Rename = aynı diskte taşıma)
    std::fs::rename(&source, &destination)
        .map_err(|e| format!("Taşıma başarısız: {}", e))?;

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
async fn validate_sorting(mods: Vec<ModMetadata>) -> Result<bool, String> {
   tokio::task::spawn_blocking(move || {
       // Simple validation: if ultimate_sort produces the same order, it's valid.
       // In a real scenario, we'd check for cycles or missing deps.
        let sorted = ultimate_sort(mods.clone(), None)?; // ultimate_sort zaten Result döndürüyor, '?' ile Err durumunu yay
        if sorted.len() != mods.len() {
            return Ok(false);
        }
        
        for (i, mod_a) in sorted.iter().enumerate() {
            if mod_a.package_id != mods[i].package_id { // mod_a zaten &ModMetadata
                return Ok(false);
            }
        }
        Ok(true)
   })
   .await
   .map_err(|e| format!("Task join error: {}", e))?
}
