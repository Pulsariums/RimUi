use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModGroup {
    pub id: String,
    pub name: String,
    #[serde(default, rename = "modIds")]
    pub mod_ids: Vec<String>,
    #[serde(default)]
    pub expanded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HistoryEntry {
    pub r#type: String,
    pub changed_ids: Vec<String>,
    pub old_active_mods: Vec<String>,
    pub new_active_mods: Vec<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModProfile {
    pub name: String,
    pub active_mods: Vec<String>,
    #[serde(default)]
    pub groups: Option<Vec<ModGroup>>,
    #[serde(default)]
    pub dead_mods: Option<Vec<String>>,
    #[serde(default)]
    pub health: Option<String>,
    #[serde(default)]
    pub history: Option<Vec<HistoryEntry>>,
    #[serde(default, rename = "isDefault")]
    pub is_default: Option<bool>,
    #[serde(default)]
    pub created_at: Option<u64>,
    #[serde(default)]
    pub updated_at: Option<u64>,
}

/// Profile loader and saver. Handles writing and loading profiles from user-defined JSON files.
pub struct ProfileStore;

impl ProfileStore {
    pub fn load_profile<P: AsRef<Path>>(path: P) -> Result<ModProfile, String> {
        let file = File::open(path).map_err(|e| format!("Failed to open profile file: {}", e))?;
        let reader = BufReader::new(file);
        let profile: ModProfile = serde_json::from_reader(reader)
            .map_err(|e| format!("Failed to parse profile JSON: {}", e))?;
        Ok(profile)
    }

    pub fn save_profile<P: AsRef<Path>>(path: P, profile: &ModProfile) -> Result<(), String> {
        if let Some(parent) = path.as_ref().parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create folders: {}", e))?;
        }
        let file = File::create(path).map_err(|e| format!("Failed to create profile file: {}", e))?;
        let writer = BufWriter::new(file);
        serde_json::to_writer_pretty(writer, profile)
            .map_err(|e| format!("Failed to serialize profile: {}", e))?;
        Ok(())
    }
}
