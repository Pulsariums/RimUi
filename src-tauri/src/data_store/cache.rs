use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use crate::mod_engine::xml_parser::{parse_about_xml, ModMetadata};

/// About.xml'in yanındaki (About/ veya mod kökündeki) preview görselini bulur.
/// Eski cache kayıtlarında preview_path boş kalabildiği için cache hit'te de çalışır.
fn find_preview_path(dir_path: &str) -> String {
    let dir = Path::new(dir_path);
    const PREVIEW_FILES: [&str; 8] = [
        "About/Preview.png",
        "About/preview.png",
        "About/Preview.jpg",
        "About/preview.jpg",
        "About/Preview.jpeg",
        "About/preview.jpeg",
        "Preview.png",
        "preview.png",
    ];
    for rel in PREVIEW_FILES {
        let candidate = dir.join(rel);
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    String::new()
}

/// SQLite metadata cache for super-fast scans.
/// Checks directory modified times, updating the DB only on changes.
pub struct CacheEngine {
    conn: Connection,
}

impl CacheEngine {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self, String> {
        let path = db_path.as_ref();
        let resolved_path = if path.is_absolute() {
            // Mutlak yol: parent dizini mevcut değilse oluştur
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create DB directory {:?}: {}", parent, e))?;
            }
            path.to_path_buf()
        } else {
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                let mut base = std::path::PathBuf::from(local_app_data);
                base.push("RimWorldModHelper");
                let _ = fs::create_dir_all(&base);
                base.push(path.file_name().unwrap_or(std::ffi::OsStr::new("mods_cache.db")));
                base
            } else {
                let mut base = std::env::temp_dir();
                base.push("RimWorldModHelper");
                let _ = fs::create_dir_all(&base);
                base.push(path.file_name().unwrap_or(std::ffi::OsStr::new("mods_cache.db")));
                base
            }
        };

        let conn = Connection::open(&resolved_path).map_err(|e| format!("SQLite error: {} (Path: {:?})", e, resolved_path))?;
        
        // Initialize table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS mod_cache (
                package_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                author TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                preview_path TEXT NOT NULL DEFAULT '',
                supported_versions TEXT NOT NULL,
                dependencies TEXT NOT NULL,
                load_after TEXT NOT NULL,
                load_before TEXT NOT NULL,
                dir_path TEXT NOT NULL,
                modified_time INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| format!("Failed to create table: {}", e))?;

        // Add index on dir_path for fast path-based cache lookups
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_mod_cache_dir_path ON mod_cache(dir_path)",
            [],
        )
        .map_err(|e| format!("Failed to create index: {}", e))?;

        Ok(Self { conn })
    }

    /// Retrieves cached mod metadata if the directory hasn't changed.
    pub fn get_mod(&self, package_id: &str, current_modified_time: u64) -> Option<ModMetadata> {
        let mut stmt = self.conn.prepare(
            "SELECT package_id, name, author, version, description, url, preview_path, supported_versions, dependencies, load_after, load_before, dir_path, modified_time
             FROM mod_cache WHERE package_id = ?"
        ).ok()?;

        let mut rows = stmt.query(params![package_id.to_lowercase()]).ok()?;
        if let Some(row) = rows.next().ok()? {
            let db_modified_time: i64 = row.get(12).ok()?;
            if db_modified_time as u64 == current_modified_time {
                let supported_versions_raw: String = row.get(7).ok()?;
                let dependencies_raw: String = row.get(8).ok()?;
                let load_after_raw: String = row.get(9).ok()?;
                let load_before_raw: String = row.get(10).ok()?;

                return Some(ModMetadata {
                    package_id: row.get(0).ok()?,
                    name: row.get(1).ok()?,
                    author: row.get(2).ok()?,
                    version: row.get(3).ok()?,
                    description: row.get(4).ok()?,
                    url: row.get(5).ok()?,
                    preview_path: {
                        let cached_preview: String = row.get(6).ok()?;
                        if cached_preview.is_empty() {
                            let dir: String = row.get(11).ok()?;
                            find_preview_path(&dir)
                        } else {
                            cached_preview
                        }
                    },
                    supported_versions: serde_json::from_str(&supported_versions_raw).unwrap_or_default(),
                    dependencies: serde_json::from_str(&dependencies_raw).unwrap_or_default(),
                    load_after: serde_json::from_str(&load_after_raw).unwrap_or_default(),
                    load_before: serde_json::from_str(&load_before_raw).unwrap_or_default(),
                    dir_path: row.get(11).ok()?,
                    is_dead: false,
                    is_dlc: false,
                    is_external: false,
                });
            }
        }
        None
    }

    /// Retrieves cached mod metadata by folder path.
    /// This allows checking the cache BEFORE parsing About.xml.
    pub fn get_mod_by_path(&self, dir_path: &str, current_modified_time: u64) -> Option<ModMetadata> {
        let mut stmt = self.conn.prepare(
            "SELECT package_id, name, author, version, description, url, preview_path, supported_versions, dependencies, load_after, load_before, dir_path, modified_time
             FROM mod_cache WHERE dir_path = ?"
        ).ok()?;

        let mut rows = stmt.query(params![dir_path]).ok()?;
        if let Some(row) = rows.next().ok()? {
            let db_modified_time: i64 = row.get(12).ok()?;
            if db_modified_time as u64 == current_modified_time {
                let supported_versions_raw: String = row.get(7).ok()?;
                let dependencies_raw: String = row.get(8).ok()?;
                let load_after_raw: String = row.get(9).ok()?;
                let load_before_raw: String = row.get(10).ok()?;

                return Some(ModMetadata {
                    package_id: row.get(0).ok()?,
                    name: row.get(1).ok()?,
                    author: row.get(2).ok()?,
                    version: row.get(3).ok()?,
                    description: row.get(4).ok()?,
                    url: row.get(5).ok()?,
                    preview_path: {
                        let cached_preview: String = row.get(6).ok()?;
                        if cached_preview.is_empty() {
                            find_preview_path(dir_path)
                        } else {
                            cached_preview
                        }
                    },
                    supported_versions: serde_json::from_str(&supported_versions_raw).unwrap_or_default(),
                    dependencies: serde_json::from_str(&dependencies_raw).unwrap_or_default(),
                    load_after: serde_json::from_str(&load_after_raw).unwrap_or_default(),
                    load_before: serde_json::from_str(&load_before_raw).unwrap_or_default(),
                    dir_path: row.get(11).ok()?,
                    is_dead: false,
                    is_dlc: false,
                    is_external: false,
                });
            }
        }
        None
    }

    /// Saves or updates the metadata in the cache DB.
    pub fn set_mod(&self, metadata: &ModMetadata, modified_time: u64) -> Result<(), String> {
        let supported_versions = serde_json::to_string(&metadata.supported_versions).unwrap_or_default();
        let dependencies = serde_json::to_string(&metadata.dependencies).unwrap_or_default();
        let load_after = serde_json::to_string(&metadata.load_after).unwrap_or_default();
        let load_before = serde_json::to_string(&metadata.load_before).unwrap_or_default();

        self.conn.execute(
            "INSERT OR REPLACE INTO mod_cache
             (package_id, name, author, version, description, url, preview_path, supported_versions, dependencies, load_after, load_before, dir_path, modified_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                metadata.package_id.to_lowercase(),
                metadata.name,
                metadata.author,
                metadata.version,
                metadata.description,
                metadata.url,
                metadata.preview_path,
                supported_versions,
                dependencies,
                load_after,
                load_before,
                metadata.dir_path,
                modified_time as i64
            ],
        )
        .map_err(|e| format!("SQLite cache save error: {}", e))?;

        Ok(())
    }

    /// Scans a directory of mods, utilizing the database cache for extremely fast subsequent reads.
    /// Optimized: checks cache by dir_path BEFORE parsing About.xml.
    pub fn scan_directory<P: AsRef<Path>>(&self, mods_dir: P) -> Result<Vec<ModMetadata>, String> {
        let mut results = Vec::new();
        let dir = mods_dir.as_ref();

        if !dir.exists() || !dir.is_dir() {
            return Ok(results);
        }

        let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read mods dir: {}", e))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let about_path = path.join("About").join("About.xml");
                if about_path.exists() {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let mtime = metadata
                        .modified()
                        .unwrap_or(UNIX_EPOCH)
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    let dir_path_str = path.to_string_lossy().to_string();

                    // 🔥 ÖNCE: dir_path ile cache'te ara (XML parse'ına gerek yok)
                    if let Some(cached) = self.get_mod_by_path(&dir_path_str, mtime) {
                        results.push(cached);
                        continue; // XML parse'ını TAMAMEN ATLA
                    }

                    // Cache miss veya mtime değişmiş → About.xml parse et
                    match parse_about_xml(&about_path) {
                        Ok(parsed) => {
                            let mut to_cache = parsed.clone();
                            to_cache.dir_path = dir_path_str;
                            let _ = self.set_mod(&to_cache, mtime);
                            results.push(to_cache);
                        }
                        Err(err) => {
                            eprintln!("Warning: Skipping mod at {:?}: {}", path, err);
                        }
                    }
                }
            }
        }

        Ok(results)
    }
}
