use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::collections::{HashMap, HashSet};
use crate::mod_engine::xml_parser::ModsConfig;

/// RimSort mantığıyla ModsConfig.xml'in XML çıktısını üretir.
fn serialize_mods_config(config: &ModsConfig) -> String {
    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    xml.push_str("<ModsConfigData>\n");

    // Version (RimSort: varsa yaz, yoksa boş geç)
    if let Some(ref ver) = config.version {
        xml.push_str(&format!("  <version>{}</version>\n", ver));
    } else {
        xml.push_str("  <version></version>\n");
    }

    // activeMods
    xml.push_str("  <activeMods>\n");
    for m in &config.active_mods {
        xml.push_str(&format!("    <li>{}</li>\n", m));
    }
    xml.push_str("  </activeMods>\n");

    // knownExpansions (RimSort: varsa yaz)
    if !config.known_expansions.is_empty() {
        xml.push_str("  <knownExpansions>\n");
        for exp in &config.known_expansions {
            xml.push_str(&format!("    <li>{}</li>\n", exp));
        }
        xml.push_str("  </knownExpansions>\n");
    }

    xml.push_str("</ModsConfigData>\n");
    xml
}

/// Automates safe atomic writing to ModsConfig.xml.
/// Writes to a temporary `.tmp` file first, then renames it.
/// Maintains automatic backups of the last configuration.
/// RimSort mantığı: version, activeMods, knownExpansions hepsini korur.
pub fn write_mods_config_atomic<P: AsRef<Path>>(
    path: P,
    config: &ModsConfig,
) -> Result<(), String> {
    let target_path = path.as_ref();
    
    // Ensure parent directory exists
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    // Backup the current ModsConfig.xml if it exists
    if target_path.exists() {
        let mut backup_path = target_path.to_path_buf();
        backup_path.set_extension("xml.bak");
        if let Err(e) = fs::copy(target_path, &backup_path) {
            eprintln!("Warning: Failed to create backup: {}", e);
        }
    }

    // Create a temporary file path
    let mut tmp_path = target_path.to_path_buf();
    tmp_path.set_extension("xml.tmp");

    // Serialize ModsConfig to XML
    let xml_content = serialize_mods_config(config);

    let mut file = File::create(&tmp_path).map_err(|e| format!("Failed to create tmp file: {}", e))?;

    write!(file, "{}", xml_content).map_err(|e| e.to_string())?;

    // Flush and sync to disk
    file.flush().map_err(|e| format!("Failed to flush: {}", e))?;
    file.sync_all().map_err(|e| format!("Failed to sync_all: {}", e))?;

    // Safely rename tmp to target
    fs::rename(&tmp_path, target_path).map_err(|e| format!("Atomic write failed on rename: {}", e))?;

    Ok(())
}

/// RimWorld 4-Tier mantığına göre modları sırala
///
/// Bu fonksiyon mevcut sort_mods() fonksiyonuna alternatif olarak
/// RimSort'un 4-Tier + Kahn's Algorithm mantığını kullanır.
pub fn sort_rimworld_mods(
    active_package_ids: &HashSet<String>,
    deps_graph: &HashMap<String, Vec<String>>,
    rev_deps_graph: &HashMap<String, Vec<String>>,
) -> Result<Vec<String>, String> {
    // Mevcut aktif mod ID'lerini al
    println!(
        "RimWorld sort başlatılıyor: {} aktif mod, {} bağımlılık",
        active_package_ids.len(),
        deps_graph.len()
    );

    match crate::mod_engine::sorter::rimworld_sort(active_package_ids, deps_graph, rev_deps_graph) {
        Ok(sorted_ids) => {
            println!("RimWorld sort başarıyla tamamlandı: {} mod sıralandı", sorted_ids.len());
            Ok(sorted_ids)
        }
        Err(cycles) => {
            let cycle_desc: Vec<String> = cycles
                .iter()
                .map(|(from, to)| format!("{} → {}", from, to))
                .collect();
            eprintln!("RimWorld sort başarısız: döngü tespit edildi: {:?}", cycle_desc);
            Err(format!(
                "Mod bağımlılıklarında döngü tespit edildi ({} adet). Döngüler: [{}]",
                cycles.len(),
                cycle_desc.join(", ")
            ))
        }
    }
}
