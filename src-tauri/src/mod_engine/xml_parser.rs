use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModMetadata {
    pub package_id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub url: String,
    pub preview_path: String,
    pub supported_versions: Vec<String>,
    pub dependencies: Vec<String>,
    pub load_after: Vec<String>,
    pub load_before: Vec<String>,
    pub dir_path: String,
    #[serde(default, rename = "isDead")]
    pub is_dead: bool,
    #[serde(default, rename = "isDlc")]
    pub is_dlc: bool,
    #[serde(default, rename = "isExternal")]
    pub is_external: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModsConfig {
    pub active_mods: Vec<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub known_expansions: Vec<String>,
}

/// Safely parses a RimWorld mod's About.xml file.
/// Handles potential format irregularities gracefully.
pub fn parse_about_xml<P: AsRef<Path>>(path: P) -> Result<ModMetadata, String> {
    let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = Reader::from_reader(BufReader::new(file));

    let mut buf = Vec::new();
    let mut metadata = ModMetadata::default();
    if let Some(parent) = path.as_ref().parent() {
        if let Some(mod_dir) = parent.parent() {
            metadata.dir_path = mod_dir.to_string_lossy().to_string();
        }
    }

    // Preview resmini About.xml'in yanındaki Preview/ klasöründen bul
    if let Some(about_dir) = path.as_ref().parent() {
        let preview_paths = [
            about_dir.join("Preview.png"),
            about_dir.join("preview.png"),
            about_dir.join("Preview.jpg"),
            about_dir.join("preview.jpg"),
            about_dir.join("About").join("Preview.png"),
            about_dir.join("About").join("preview.png"),
        ];
        for p in &preview_paths {
            if p.exists() {
                metadata.preview_path = p.to_string_lossy().to_string();
                break;
            }
        }
    }

    let mut current_tag = Vec::new();
    
    // For nested lists like <supportedVersions>, <dependencies>, <loadAfter>, <loadBefore>
    let mut in_supported_versions = false;
    let mut in_dependencies = false;
    let mut in_load_after = false;
    let mut in_load_before = false;
    let mut in_url = false;
    let mut in_description = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                current_tag.push(name.clone());
                
                match name.as_str() {
                    "supportedversions" => in_supported_versions = true,
                    "dependencies" => in_dependencies = true,
                    "loadafter" => in_load_after = true,
                    "loadbefore" => in_load_before = true,
                    "url" => in_url = true,
                    "description" => in_description = true,
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                current_tag.pop();
                
                match name.as_str() {
                    "supportedversions" => in_supported_versions = false,
                    "dependencies" => in_dependencies = false,
                    "loadafter" => in_load_after = false,
                    "loadbefore" => in_load_before = false,
                    "url" => in_url = false,
                    "description" => in_description = false,
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map(|c| c.into_owned()).unwrap_or_default();
                if text.is_empty() {
                    buf.clear();
                    continue;
                }

                if let Some(tag) = current_tag.last() {
            match tag.as_str() {
                "packageid" if !in_dependencies => {
                    metadata.package_id = text.trim().to_lowercase();
                }
                "name" => {
                    if current_tag.contains(&"author".to_string()) {
                        // Nested under <author> in some older About.xml
                    } else if current_tag.len() <= 2 {
                        metadata.name = text;
                    }
                }
                "version" if current_tag.len() <= 3 && !text.trim().is_empty() => {
                    metadata.version = text.trim().to_string();
                }
                "description" if in_description => {
                    metadata.description = text.trim().to_string();
                }
                "url" if in_url => {
                    metadata.url = text.trim().to_string();
                }
                        "author" => {
                            // If just plain text under author
                            if metadata.author.is_empty() {
                                metadata.author = text;
                            }
                        }
                        "li" => {
                            let trimmed = text.trim().to_string();
                            if !trimmed.is_empty() {
                                if in_supported_versions {
                                    metadata.supported_versions.push(trimmed);
                                } else if in_dependencies {
                                    // Sometimes dependency is a complex struct or text.
                                    // Let's check parent tags or if it's just plain text.
                                    // In RimWorld, dependency li can be: <li>packageId</li> or <li> <packageId>...
                                    metadata.dependencies.push(trimmed.to_lowercase());
                                } else if in_load_after {
                                    metadata.load_after.push(trimmed.to_lowercase());
                                } else if in_load_before {
                                    metadata.load_before.push(trimmed.to_lowercase());
                                }
                            }
                        }
                        // If there is <packageId> inside <dependencies><li><packageId>...
                        "dependency" | "packageid" if in_dependencies => {
                            let trimmed = text.trim().to_lowercase();
                            if !trimmed.is_empty() && !metadata.dependencies.contains(&trimmed) {
                                metadata.dependencies.push(trimmed);
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    if metadata.package_id.is_empty() {
        return Err("Missing <packageId> in About.xml".to_string());
    }

    Ok(metadata)
}

/// Safely parses the active mods list from RimWorld's ModsConfig.xml.
/// RimSort mantığı: version, activeMods, knownExpansions hepsini oku.
pub fn parse_mods_config_xml<P: AsRef<Path>>(path: P) -> Result<ModsConfig, String> {
    let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = Reader::from_reader(BufReader::new(file));

    let mut buf = Vec::new();
    let mut active_mods = Vec::new();
    let mut known_expansions = Vec::new();
    let mut version: Option<String> = None;
    let mut current_tag = Vec::new();
    let mut in_active_mods = false;
    let mut in_known_expansions = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                current_tag.push(name.clone());
                match name.as_str() {
                    "activemods" => in_active_mods = true,
                    "knownexpansions" => in_known_expansions = true,
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                current_tag.pop();
                match name.as_str() {
                    "activemods" => in_active_mods = false,
                    "knownexpansions" => in_known_expansions = false,
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map(|c| c.into_owned()).unwrap_or_default();
                let trimmed = text.trim().to_string();
                if trimmed.is_empty() {
                    buf.clear();
                    continue;
                }

                if let Some(tag) = current_tag.last() {
                    match tag.as_str() {
                        "version" if current_tag.len() == 2 => {
                            // <ModsConfigData><version>X</version>
                            version = Some(trimmed);
                        }
                        "li" if in_active_mods => {
                            active_mods.push(trimmed.to_lowercase());
                        }
                        "li" if in_known_expansions => {
                            known_expansions.push(trimmed.to_lowercase());
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML error in ModsConfig.xml: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(ModsConfig {
        active_mods,
        version,
        known_expansions,
    })
}
