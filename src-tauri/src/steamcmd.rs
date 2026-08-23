//! SteamCMD yönetimi: tespit, otomatik kurulum ve workshop indirme.
//!
//! İndirme hattı:
//!   steamcmd +force_install_dir <steamcmd_klasörü> +login anonymous
//!           +workshop_download_item 294100 <mod_id> +quit
//!
//! ÖNEMLİ: workshop_download_item dosyaları <force_install_dir>/steamapps/
//! workshop/content/294100/<id> altına indirir — RimWorld orayı görmez.
//! Bu yüzden indirme sonrası klasör Mods köküne taşınır.
//!
//! force_install_dir, dokümana göre login'den ÖNCE gelmelidir.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

const STEAMCMD_ZIP_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
const APP_ID: &str = "294100";

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamCmdResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

/// İlerleme/faz olayları (frontend: "steamcmd-progress")
#[derive(Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub progress: f32,
    pub speed: String,
    pub message: String,
}

/// steamcmd_resolve komutunun sonucu
#[derive(Debug, Serialize)]
pub struct ResolveResult {
    /// "ok" | "found_elsewhere" | "missing"
    pub status: String,
    pub path: Option<String>,
}

pub struct SteamCmdManager {
    pub executable_path: String,
}

impl SteamCmdManager {
    pub fn new(path: String) -> Self {
        Self { executable_path: path }
    }

    pub fn is_installed(&self) -> bool {
        Path::new(&self.executable_path).exists()
    }

    pub fn download_mod(&self, window: tauri::Window, mod_id: String, install_dir: String) -> Result<String, String> {
        if install_dir.trim().is_empty() {
            return Err("RimWorld Mods klasörü ayarlı değil (Ayarlar → Yol).".into());
        }
        let exe = PathBuf::from(&self.executable_path);
        if !exe.exists() {
            return Err(format!("steamcmd.exe bulunamadı: {}", self.executable_path));
        }
        let work_dir = exe
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        let emit = |progress: f32, speed: &str, message: &str| -> Result<(), String> {
            window
                .emit("steamcmd-progress", ProgressPayload {
                    progress,
                    speed: speed.to_string(),
                    message: message.to_string(),
                })
                .map_err(|e| format!("Event emit failed: {e}"))
        };

        let _ = emit(0.0, "", "SteamCMD başlatılıyor...");

        let mut cmd = Command::new(&exe);
        // Sıra önemli: force_install_dir login'den ÖNCE gelmeli.
        cmd.arg("+force_install_dir").arg(&work_dir);
        cmd.arg("+login").arg("anonymous");
        let mut child = cmd
            .arg("+workshop_download_item")
            .arg(APP_ID)
            .arg(&mod_id)
            .arg("+quit")
            .current_dir(&work_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("SteamCMD çalıştırılamadı: {e}"))?;

        let stdout = child.stdout.take().ok_or("Stdout capture failed")?;
        let stderr = child.stderr.take();
        let stderr_thread = std::thread::spawn(move || {
            let mut s = String::new();
            if let Some(mut e) = stderr {
                use std::io::Read;
                let _ = e.read_to_string(&mut s);
            }
            s
        });

        let reader = BufReader::new(stdout);
        let mut full_output = String::new();
        for line in reader.lines() {
            let line = line.map_err(|e| format!("Reading stdout failed: {e}"))?;
            full_output.push_str(&line);
            full_output.push('\n');

            // Yüzde içeren ilerleme satırı: [===>   ] 30% (1.2 MB/s)
            if let Some(cap) = line.find('%') {
                let _ = &line[..cap + 1];
                let speed_part = if line.contains('(') && line.contains(')') {
                    let start = line.find('(').unwrap();
                    let end = line.find(')').unwrap();
                    &line[start + 1..end]
                } else {
                    ""
                };
                let progress_val = line
                    .split_whitespace()
                    .find(|s| s.contains('%'))
                    .and_then(|s| s.trim_end_matches('%').parse::<f32>().ok())
                    .unwrap_or(0.0);
                let _ = emit(progress_val, speed_part, "İndiriliyor");
            } else if line.contains("Connecting") || line.contains("logging in") || line.contains("Waiting") {
                let _ = emit(0.0, "", "Steam'e bağlanılıyor...");
            } else if line.contains("Extracting") || line.contains("extracting") {
                let _ = emit(95.0, "", "Ayıklanıyor...");
            } else if line.contains("ERROR") || line.contains("Error!") {
                let _ = emit(0.0, "", &format!("Hata: {line}"));
            }
        }

        let status = child.wait().map_err(|e| format!("Wait failed: {e}"))?;
        let stderr_out = stderr_thread.join().unwrap_or_default();
        if !stderr_out.trim().is_empty() {
            full_output.push_str(&stderr_out);
        }

        // SteamCMD bazı hatalarda exit 0 döner; başarıyı çıktıdan doğrula.
        let success = status.success() && full_output.contains("Success.");
        if !success {
            let tail: Vec<&str> = full_output
                .lines()
                .filter(|l| !l.trim().is_empty())
                .rev()
                .take(4)
                .collect();
            let tail = tail.into_iter().rev().collect::<Vec<_>>().join(" | ");
            let _ = emit(0.0, "", "İndirme başarısız");
            return Err(if tail.is_empty() {
                "SteamCMD indirme başarısız (çıktı alınamadı).".to_string()
            } else {
                format!("SteamCMD: {tail}")
            });
        }

        let _ = emit(98.0, "", "Mods klasörüne taşınıyor...");
        move_downloaded(&work_dir, &install_dir, &mod_id)?;
        let _ = emit(100.0, "", "Tamamlandı");
        Ok(full_output)
    }

    pub fn update_mods(&self, mod_ids: Vec<String>, window: tauri::Window, install_dir: String) -> Result<Vec<(String, bool)>, String> {
        let mut results = Vec::new();
        for id in mod_ids {
            match self.download_mod(window.clone(), id.clone(), install_dir.clone()) {
                Ok(_) => results.push((id, true)),
                Err(e) => {
                    eprintln!("Mod {} güncellenirken hata oluştu: {}", id, e);
                    results.push((id, false));
                }
            }
        }
        Ok(results)
    }
}

/// İndirilen modu <work_dir>/steamapps/.../<id> konumundan <install_dir>/<id>'ye taşır.
fn move_downloaded(work_dir: &Path, install_dir: &str, mod_id: &str) -> Result<(), String> {
    let src = work_dir
        .join("steamapps")
        .join("workshop")
        .join("content")
        .join(APP_ID)
        .join(mod_id);
    if !src.exists() {
        return Err(format!("İndirilen mod klasörü bulunamadı: {}", src.display()));
    }
    let target = Path::new(install_dir).join(mod_id);
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Eski mod klasörü silinemedi: {e}"))?;
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mods klasörü oluşturulamadı: {e}"))?;
    }
    // Aynı diskte rename; farklı diskte kopyala+sil fallback'i.
    if std::fs::rename(&src, &target).is_err() {
        copy_dir_all(&src, &target).map_err(|e| format!("Mod taşınırken kopyalama hatası: {e}"))?;
        let _ = std::fs::remove_dir_all(&src);
    }
    // steamcmd klasöründe oluşan steamapps iskeletini temizle
    let _ = std::fs::remove_dir_all(work_dir.join("steamapps"));
    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// steamworks_dl modülünün kullanması için genel kopyalayıcı.
pub(crate) fn copy_dir_all_pub(src: &Path, dst: &Path) -> std::io::Result<()> {
    copy_dir_all(src, dst)
}

/// Uygulamanın yönettiği SteamCMD klasörü: %LOCALAPPDATA%/RimWorldForge/steamcmd
pub fn managed_steamcmd_dir() -> Option<PathBuf> {
    std::env::var("LOCALAPPDATA")
        .ok()
        .map(|root| Path::new(&root).join("RimWorldForge").join("steamcmd"))
}

pub fn managed_steamcmd_exe() -> Option<PathBuf> {
    managed_steamcmd_dir().map(|d| d.join("steamcmd.exe"))
}

/// Cihazda kurulu steamcmd.exe'yi yaygın konumlarda arar (path ayarı bozuk olsa bile).
pub fn find_existing_steamcmd() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(m) = managed_steamcmd_exe() {
        candidates.push(m);
    }
    for drive in ["C", "D", "E", "F", "G", "H"] {
        candidates.push(PathBuf::from(format!("{drive}:\\steamcmd\\steamcmd.exe")));
        candidates.push(PathBuf::from(format!("{drive}:\\SteamCMD\\steamcmd.exe")));
        candidates.push(PathBuf::from(format!("{drive}:\\Program Files\\steamcmd\\steamcmd.exe")));
    }
    candidates.push(PathBuf::from("C:\\Program Files (x86)\\Steam\\steamcmd.exe"));
    // Registry: HKCU\Software\Valve\Steam\SteamPath (nadiren <steam>\steamcmd.exe kurulur)
    if let Ok(out) = Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = s.lines().find(|l| l.contains("SteamPath")) {
            if let Some(val) = line.split("REG_SZ").nth(1) {
                let val = val.trim();
                if !val.is_empty() {
                    candidates.push(Path::new(val).join("steamcmd.exe"));
                }
            }
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

/// Ayarlanan yolu çözer: ok (kullanılabilir) / found_elsewhere (onarılabilir) / missing
pub fn resolve_steamcmd(configured_path: &str) -> ResolveResult {
    let cfg = configured_path.trim();
    if !cfg.is_empty() && Path::new(cfg).exists() {
        return ResolveResult { status: "ok".into(), path: Some(cfg.to_string()) };
    }
    if let Some(m) = managed_steamcmd_exe() {
        if m.exists() {
            let status = if cfg.is_empty() { "ok" } else { "found_elsewhere" };
            return ResolveResult {
                status: status.into(),
                path: Some(m.to_string_lossy().into_owned()),
            };
        }
    }
    if let Some(found) = find_existing_steamcmd() {
        return ResolveResult {
            status: "found_elsewhere".into(),
            path: Some(found.to_string_lossy().into_owned()),
        };
    }
    ResolveResult { status: "missing".into(), path: None }
}

/// SteamCMD'yi yönetilen klasöre indirip kurar (tek tık akışı).
/// İlerlemeyi "steamcmd-progress" olayıyla iletir.
pub fn setup_steamcmd(window: &tauri::Window) -> Result<PathBuf, String> {
    let dir = managed_steamcmd_dir()
        .ok_or_else(|| "LOCALAPPDATA bulunamadı; SteamCMD yolunu Ayarlar'dan elle seçin.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let zip_path = dir.join("steamcmd.zip");

    let emit = |progress: f32, message: &str| -> Result<(), String> {
        window
            .emit("steamcmd-progress", ProgressPayload {
                progress,
                speed: String::new(),
                message: message.to_string(),
            })
            .map_err(|e| format!("Event emit failed: {e}"))
    };

    let _ = emit(5.0, "SteamCMD indiriliyor (0.7 MB)...");
    let zip_bytes = reqwest::blocking::Client::builder()
        .user_agent("RimWorldForge/1.0")
        .build()
        .map_err(|e| format!("HTTP istemcisi oluşturulamadı: {e}"))?
        .get(STEAMCMD_ZIP_URL)
        .send()
        .map_err(|e| format!("SteamCMD indirilemedi: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SteamCMD indirilemedi: {e}"))?
        .bytes()
        .map_err(|e| format!("SteamCMD verisi okunamadı: {e}"))?;
    std::fs::write(&zip_path, &zip_bytes).map_err(|e| format!("Zip yazılamadı: {e}"))?;

    let _ = emit(20.0, "SteamCMD açılıyor...");
    let file = std::fs::File::open(&zip_path).map_err(|e| format!("Zip açılamadı: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Zip okunamadı: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip girdisi okunamadı: {e}"))?;
        let Some(name) = entry.enclosed_name() else { continue };
        let out_path = dir.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
            }
            let mut out = std::fs::File::create(&out_path).map_err(|e| format!("Dosya yazılamadı: {e}"))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| format!("Dosya kopyalanamadı: {e}"))?;
        }
    }
    let _ = std::fs::remove_file(&zip_path);

    // İlk çalıştırma: SteamCMD kendini kurar/günceller (~150 MB, yalnızca bir kez).
    let _ = emit(30.0, "SteamCMD ilk kurulumu yapılıyor (birkaç dakika sürebilir)...");
    let _ = Command::new(dir.join("steamcmd.exe"))
        .arg("+quit")
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("SteamCMD ilk kurulumu başlatılamadı: {e}"))?;

    let exe = dir.join("steamcmd.exe");
    if !exe.exists() {
        return Err("SteamCMD kurulumu tamamlandı ancak steamcmd.exe bulunamadı.".into());
    }
    let _ = emit(100.0, "SteamCMD hazır.");
    Ok(exe)
}

/// İndirme öncesi yolu garanti eder: ayar → yönetilen → cihazda tespit → otomatik kur.
pub fn ensure_steamcmd(window: &tauri::Window, configured_path: &str) -> Result<PathBuf, String> {
    let cfg = configured_path.trim();
    if !cfg.is_empty() {
        let p = PathBuf::from(cfg);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Some(m) = managed_steamcmd_exe() {
        if m.exists() {
            return Ok(m);
        }
    }
    if let Some(found) = find_existing_steamcmd() {
        return Ok(found);
    }
    setup_steamcmd(window)
}
